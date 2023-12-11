const express = require("express");
const app = express();
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const session = require("express-session");
const flash = require("express-flash");
const passport = require("passport");

const initializePassport = require("./passportConfig");

initializePassport(passport);

const PORT = process.env.PORT || 4000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: "secret",

    resave: false,

    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register");
});

app.get("/users/login", checkAuthenticated, (req, res) => {
  res.render("login");
});

app.get("/users/weatherDashboard", checkNotAuthenticated, (req, res) => {
  res.render("weatherDashboard", { user: req.user.name, weatherInfo: null });
});

app.get("/users/logout", (req, res) => {
  req.logOut(function (err) {
    if (err) {
      return next(err);
    }
    req.flash("success_msg", "You have successfully logged out.");
    res.redirect("/users/login");
  });
});

app.post("/users/register", async (req, res) => {
  let { name, email, password, password2 } = req.body;

  console.log({
    name,
    email,
    password,
    password2,
  });

  let errors = [];

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please enter all fields! " });
  }
  if (password.length < 6) {
    errors.push({ message: "Password should be at least 6 characters" });
  }
  if (password !== password2) {
    errors.push({ message: "Password do not match! " });
  }

  if (errors.length > 0) {
    res.render("register", { errors });
  } else {
    // Form validation is successful

    let hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);

    pool.query(
      `SELECT * FROM users
            WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          throw err;
        }

        console.log(results.rows);

        if (results.rows.length > 0) {
          errors.push({ message: "Email is already registered!" });
          res.render("register", { errors });
        } else {
          pool.query(
            `INSERT INTO users (name, email, password)
                        VALUES ($1, $2, $3)
                        RETURNING id, password`,
            [name, email, hashedPassword],
            (err, results) => {
              if (err) {
                throw err;
              }
              console.log(results.rows);
              req.flash("success_msg", "You are now registered. Please log in");
              res.redirect("/users/login");
            }
          );
        }
      }
    );
  }
});

app.post(
  "/users/login",
  passport.authenticate("local", {
    successRedirect: "/users/weatherDashboard",
    failureRedirect: "/users/login",
    failureFlash: true,
  })
);

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/weatherDashboard");
  }

  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect("/users/login");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

//Handling weather stuff

app.post("/users/weatherDashboard", (req, res) => {
  const cityName = req.body["city-name"];
  getWeather(cityName, req, res);
});

function getWeather(cityName, req, res) {
  fetch(
    `http://api.openweathermap.org/geo/1.0/direct?q=${cityName}&limit=5&appid=da362b5cbee38057ca49f9880098b1a9`
  )
    .then((res) => res.json())
    .then((data) => {
      const lon = data[0].lon;
      const lat = data[0].lat;

      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=da362b5cbee38057ca49f9880098b1a9&units=metric`
      )
        .then((res) => res.json())
        .then((data) => {
          const weatherData = data;
          const weatherInfo = {
            description: weatherData.weather[0].main,
            temp: weatherData.main.temp,
            tempFeel: weatherData.main.feels_like,
          };
          res.render("weatherDashboard", { user: req.user.name, weatherInfo });
        })
        .catch((error) => {
          console.error("Error fetching weather data:", error);
          res.status(500).send("Internal Server Error");
        });
    })
    .catch((error) => {
      console.error("Error fetching geo data:", error);
      res.status(500).send("Internal Server Error");
    });
}

