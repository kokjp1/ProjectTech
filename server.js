// express & dotenv setup

require("dotenv").config();
const xss = require("xss");
const bcrypt = require("bcrypt");
const express = require("express");
const app = express();
const session = require("express-session");
app.use(
  session({
    //Sla de sessie niet opnieuw op als deze onveranderd is
    resave: false,

    // Sla elke nieuwe sessie in het geheugen op, ook als deze niet gewijzigd is
    saveUninitialized: true,

    // secret key for session encryption
    secret: process.env.SESSION_SECRET,

    ttl: 30 * 60, //sessieduur is 30 minute
    cookie: {
      maxAge: 30 * 60 * 1000, //sessieduur is 30 minute
      secure: false, //true als HTTPS
    },
    sameSite: "strict", //beschermt tegen CSRF aanvallen
    rolling: true, //verlengt de sessie bij elke request
  })
);

// app.use(xss());

app.use(express.urlencoded({ extended: true }));
app.use(express.static("static"));
app.set("view engine", "ejs");
app.set("views", "views");

// MongoDB setup

const { MongoClient, ServerApiVersion } = require("mongodb");

const mongoDBtoken = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const { ObjectId } = require("mongodb");
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

app.get("/home.ejs", (req, res) => {
  res.render("home.ejs");

  const userInput = req.query.name || "";
  const safeInput = xss(userInput); // Sanitizing input

  res.send(`Home, ${safeInput}`);
});

app.get("/login", onLogin);
app.get("/register", onRegister);

app.post("/login", accountLogin);

// MongoDB database connection
const activeDatabase = client.db(process.env.DB_NAME);
const activeCollection = activeDatabase.collection(process.env.DB_COLLECTION);

async function accountLogin(req, res) {
  try {
    const formUsernameOrEmail = req.body.usernameOrEmail;
    const formPassword = req.body.password;

    // Find the account by email or username
    const account = await activeCollection.findOne(
      {
        $or: [
          { email: formUsernameOrEmail },
          { username: formUsernameOrEmail },
        ],
      },
      { collation: { locale: "en", strength: 2 } } // Makes username search case-insensitive
    );

    // If no account is found
    if (!account) {
      return res.render("login.ejs", {
        errorMessageUsernameOrEmail:
          "We cannot find an account with this email or username, please try again or register.",
        errorMessagePassword: "",
      });
    }

    const passwordMatch = await bcrypt.compare(formPassword, account.password);
    // If the password is incorrect
    if (!passwordMatch) {
      return res.render("login.ejs", {
        errorMessageUsernameOrEmail: "",
        errorMessagePassword: "Incorrect password, please try again.",
      });
    }

    // Store userID in session
    req.session.userId = account._id;

    // If everything is correct
    return res.redirect("/home");
  } catch (error) {
    console.error(error);
    res.status(500).send("500: server error");
  }
}

app.get("/home", async (req, res) => {
  if (!req.session.userId) {
    return res.render("login.ejs", {
      errorMessageUsernameOrEmail:
        "You have been logged out, please log in again.",
      errorMessagePassword: "",
    });
  }

  try {
    // Convert the userId from the session to an ObjectId (hexstring is new, not deprecated)
    const userId = new ObjectId.createFromHexString(req.session.userId);
    // Fetch the user from the database using the ObjectId
    const user = await activeCollection.findOne({ _id: userId });

    // Render the home page with the username fetched from the database
    res.render("home.ejs", { username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).send("500: server error");
  }
});

function onLogin(req, res) {
  res.render("login.ejs", {
    errorMessageUsernameOrEmail: "",
    errorMessagePassword: "",
  });
}

// register

app.post("/register", registerAccount);

async function registerAccount(req, res) {
  try {
    const registeringUsername = req.body.username;
    const registeringEmail = req.body.email;
    const registeringPassword = req.body.password;
    const saltRounds = 10;

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

    const hashedPassword = await bcrypt.hash(registeringPassword, saltRounds);

    await activeCollection.insertOne({
      username: registeringUsername,
      email: registeringEmail,
      password: hashedPassword,
    });

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
