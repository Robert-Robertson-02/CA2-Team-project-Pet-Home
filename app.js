const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_005',
    password: 'c237005@2026!',
    database: 'C237_005_team3_ca2',
    ssl: {
         rejectUnauthorized: false
    }   

});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));


app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,

    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());


const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};


const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};


const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};


app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});



app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;


    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/shopping');
            else
                res.redirect('/inventory');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});



app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Ian nathan quah yu yang 25026099 - (Let me know if you want to make changes to the code here before doing so)
app.get('/add', checkAuthenticated, (req, res) => {
    res.render('addpet', { user: req.session.user, errors: req.flash('error'), messages: req.flash('success') });
});

app.post('/add', checkAuthenticated, upload.single('image'), (req, res) => {
    const { pet_name, animal_type, age, description, allergies, breed } = req.body;

    if (pet_name == '') {
        req.flash('error', 'Pet name is required.');
        return res.redirect('/add');
    }

    if (animal_type == '') {
        req.flash('error', 'Type of animal is required.');
        return res.redirect('/add');
    }

    if (age == '') {
        req.flash('error', 'Age is required.');
        return res.redirect('/add');
    }

    if (breed == '') {
        req.flash('error', 'Breed is required.');
        return res.redirect('/add');
    }
    if (isNaN(age)) {
    req.flash('error', 'Age must be a number.');
    return res.redirect('/add');
    }
    if (age <= 0) {
        req.flash('error', 'Age must be a positive number.');
        return res.redirect('/add');
    }

    let image = null;
    if (req.file) {
        image = req.file.filename;
    }

    const sql = `INSERT INTO pets (pet_name, animal_type, age, description, allergies, breed, image, user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    connection.query(sql, [pet_name, animal_type, age, description, allergies, breed, image, req.session.user.id], (err, result) => {
        if (err) {
            throw err;
        }
        req.flash('success', 'Pet added successfully!');
        res.redirect('/pets');
    });
});
// My routes end here




//Irzan 25021343 PART F
app.get('/filter', (req, res) => {
const sqlType = "SELECT DISTINCT Type FROM pet ORDER BY Type ASC";
const sqlBreed = "SELECT DISTINCT Breed FROM pet ORDER BY Breed ASC";
const sqlAge   = "SELECT DISTINCT Age FROM pet ORDER BY Age ASC";

  // Run queries in parallel
  db.query(sqlType, (err, type) => {
    if (err) throw err;
    db.query(sqlBreed, (err, breeds) => {
      if (err) throw err;
      db.query(sqlAge, (err, ages) => {
        if (err) throw err;
        res.render('filter', {
          breeds: breeds,
          type: type,
          ages: ages
        });
      });
    });
  });
});


app.get('/filtered', (req, res) => {
  const keyword = req.query.search;
  const breed = req.query['breed[]'];
  const type = req.query['type[]'];
  const age = req.query['age[]'];

  let sql = "SELECT * FROM pet WHERE 1=1";
  const values = [];

  // If keyword search is provided
  if (keyword) {
    sql += " AND (name LIKE ? OR description LIKE ?)";
    values.push(`%${keyword}%`, `%${keyword}%`);
  }

  // If filters are provided
  if (breed) {
    sql += " AND breed IN (?)";
    values.push(Array.isArray(breed) ? breed : [breed]);
  }
  if (type) {
    sql += " AND type IN (?)";
    values.push(Array.isArray(type) ? type : [type]);
  }
  if (age) {
    sql += " AND age IN (?)";
    values.push(Array.isArray(age) ? age : [age]);
  }

  db.query(sql, values, (err, results) => {
    if (err) throw err;
    res.render('filtered', { pet: results });
  });
});
//END OF PART F

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
