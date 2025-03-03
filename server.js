// express & dotenv setup

require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("static"));
app.set("view engine", "ejs");
app.set("views", "views");

// MongoDB setup

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const mongoDBtoken = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

const client = new MongoClient(mongoDBtoken, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// MongoDB connection

client
  .connect()
  .then(() => {
    console.log("📥 Database connection established 📤");
  })
  .catch((err) => {
    console.log(`Database connection error - ${err}`);
    console.log(`For mongoDBtoken - ${mongoDBtoken}`);
  });

// app routes
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/login", onLogin);
app.get("/register", onRegister);

app.post("/login", accountLogin);

// MongoDB database connection
const activeDatabase = client.db(process.env.DB_NAME);
const activeCollection = activeDatabase.collection(process.env.DB_COLLECTION);

async function accountLogin(req, res) {
  try {
    const formUsername = req.body.username;
    const formEmail = req.body.email;
    const formPassword = req.body.password;

    const account = await activeCollection.findOne({ email: formEmail });
    // checken of er een object/acc is met het emailadres, zo ja, dan slaat hij HET HELE OBJECT (inc. password) op in "account"
    // als hij geen account kan vinden met het emailadres, dan is account waarde undefined (en dus false)

    if (!account) {
      return res.render("login.ejs", {
        errorMessageEmail:
          "We cannot find an account with this email, please try again or register",
        errorMessagePassword: "",
      });
    }

    if (account.password === formUsername) {
      return res.send(
        '<img src="https://media.tenor.com/Ex-Vvbuv2DQAAAAM/happy-birthday-celebrate.gif">'
      );
    } else {
      return res.render("login.ejs", {
        errorMessageEmail: "",
        errorMessagePassword:
          'False password try again or choose "forgot password"',
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("500: server error");
  }
}

const attempts = {};

async function passwordCooldown(req, res) {
  try {
    const { username, email, password } = req.body;

    // Check if the email has exceeded the maximum attempts and is still in cooldown
    if (attempts[email] && attempts[email].cooldown_until > Date.now()) {
      const cooldownTime = attempts[email].cooldown_until - Date.now();
      return res.render("login.ejs", {
        errorMessageEmail: `Too many attempts. Please try again in 30 seconds.`,
        errorMessagePassword: "",
      });
    }

    // Find the account associated with the provided email
    const account = await activeCollection.findOne({ email });

    if (!account) {
      // If the account doesn't exist, increment the attempt count and set cooldown if necessary
      if (!attempts[email]) {
        attempts[email] = { attempts: 0, cooldown_until: 0 };
      }
      attempts[email].attempts++;
      if (attempts[email].attempts >= 4) {
        attempts[email].cooldown_until = Date.now() + 30000; // 30 seconds cooldown
      }
      return res.render("login.ejs", {
        errorMessageEmail:
          "We cannot find a user with this email address. If you do not have an account, please register.",
        errorMessagePassword: "",
      });
    }

    // Check if the password is correct
    if (account.password !== password) {
      // If the password is incorrect, increment the attempt count and set cooldown if necessary
      if (!attempts[email]) {
        attempts[email] = { attempts: 0, cooldown_until: 0 };
      }
      attempts[email].attempts++;
      if (attempts[email].attempts >= 4) {
        attempts[email].cooldown_until = Date.now() + 30000; // 30 seconds cooldown
      }
      return res.render("login.ejs", {
        errorMessageEmail: "",
        errorMessagePassword:
          'False password, please try again or choose "forgot password"',
      });
    }

    // Check if the username is correct
    if (account.username !== username) {
      // If the username is incorrect, increment the attempt count and set cooldown if necessary
      if (!attempts[username]) {
        attempts[username] = { attempts: 0, cooldown_until: 0 };
      }
      attempts[username].attempts++;
      if (attempts[username].attempts >= 4) {
        attempts[username].cooldown_until = Date.now() + 30000; // 30 seconds cooldown
      }
      return res.render("login.ejs", {
        errorMessageEmail: "",
        errorMessagePassword:
          'False username, please try again or choose "forgot password"',
      });
    }

    // If the login is successful, reset the attempt count and cooldown
    attempts[email] = { attempts: 0, cooldown_until: 0 };

    // Login successful, render success page
    return res.send(
      '<img src="https://media.tenor.com/Ex-Vvbuv2DQAAAAM/happy-birthday-celebrate.gif">'
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("500: server error");
  }
}

function onLogin(req, res) {
  res.render("login.ejs", { errorMessageEmail: "", errorMessagePassword: "" });
}

app.post("/register", registerAccount);

async function registerAccount(req, res) {
  try {
    const registeringUsername = req.body.username;
    const registeringEmail = req.body.email;
    const registeringPassword = req.body.password;

    // Check if the username or email is already in use
    const existingUser = await activeCollection.findOne({
      username: registeringUsername,
    });
    const existingEmail = await activeCollection.findOne({
      email: registeringEmail,
    });

    if (existingUser) {
      return res.render("register.ejs", {
        errorMessageUsername: "This username is already in use.",
        errorMessageEmail: "",
        errorMessagePassword: "",
      });
    }

    if (existingEmail) {
      return res.render("register.ejs", {
        errorMessageUsername: "",
        errorMessageEmail: "This email is already in use.",
        errorMessagePassword: "",
      });
    }

    // Password validation
    const passwordRegex =
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (!passwordRegex.test(registeringPassword)) {
      return res.render("register.ejs", {
        errorMessagePassword:
          "Password must be at least 8 characters long, including an uppercase letter, a number, and a special character.",
        errorMessageEmail: "",
        errorMessageUsername: "",
      });
    }

    registeredAccount = await activeCollection.insertOne({
      username: registeringUsername,
      email: registeringEmail,
      password: registeringPassword,
    });

    console.log(
      `added account to database with _id: ${registeredAccount.insertedId}`
    );
    res.send("account toegevoegd");
  } catch (error) {
    console.error(error);
    res.status(500).send("500: server error");
  }
}

function onRegister(req, res) {
  res.render("register.ejs", {
    errorMessageUsername: "",
    errorMessageEmail: "",
    errorMessagePassword: "",
  });
}

// error handlers - **ALTIJD ONDERAAN HOUDEN**

app.use((req, res) => {
  console.error("404 error at URL: " + req.url);
  res.status(404).send("404 error at URL: " + req.url);
});

app.use((err, req, res) => {
  console.error(err.stack);
  res.status(500).send("500: server error");
});

// Start server **ALTIJD ONDERAAN**
app.listen(process.env.PORT, () => {
  console.log("✅ Server gestart en online ✅");
  console.log(
    `🌐 beschikbaar op port: http://localhost:${process.env.PORT} 🌐`
  );
});
