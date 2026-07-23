const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const { sortBy } = require('async');
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
app.use('/images', express.static('public/images'));
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
        res.redirect('/dashboard');
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

app.get('/view',  (req, res) => {
    res.render('index', {user: req.session.user,  messages: req.flash('success'), searchQuery: req.flash('success'), animalTypeFilter : req.flash('success'),
        sortBy : req.flash('success'),
        pets : req.flash('success'),
        errors : req.flash('success')
    } );
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
                res.redirect('/');//placeholder
            else
                res.redirect('/');//placeholder
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

// PART B: ADDING PETS and transferring pets from pets table to adopted pets table (Ian nathan quah yu yang 25026099)

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

    const sql = `INSERT INTO pets (pet_name, animal_type, age, description, allergies, breed, image, user_id, deleted) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`;

    connection.query(sql, [pet_name, animal_type, age, description, allergies, breed, image, req.session.user.id], (err, result) => {
        if (err) {
            throw err;
        }
        req.flash('success', 'Pet added successfully!');
        res.redirect('/'); //placeholder
    });
});

app.post('/adopt/:id', checkAuthenticated, (req, res) => {
    const pet_id = req.params.id;

    const selectSql = "SELECT * FROM pets WHERE pet_id = ?";
    connection.query(selectSql, [pet_id], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length === 0) {
            req.flash('error', 'Pet not found.');
            return res.redirect('/');
        }

        const pet = results[0];

        const insertSql = `INSERT INTO adopted_pets 
            (original_pet_id, pet_name, animal_type, age, description, allergies, breed, image, user_id, adopted_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(insertSql, [
            pet.pet_id, pet.pet_name, pet.animal_type, pet.age,
            pet.description, pet.allergies, pet.breed, pet.image,
            pet.user_id, req.session.user.id
        ], (err, result) => {
            if (err) {
                throw err;
            }

            const deleteSql = "DELETE FROM pets WHERE pet_id = ?";
            connection.query(deleteSql, [pet_id], (err) => {
                if (err) {
                    throw err;
                }

                req.flash('success', 'Pet adopted successfully!');
                res.redirect('/');
            });
        });
    });
});

// END OF PART B

///part C
// ============================================
// HOMEPAGE - FIXED (ONLY ONE)
// ============================================
app.get('/', (req, res) => {
    // First, let's check what columns exist in the pets table
    connection.query("DESCRIBE pets", (err, columns) => {
        if (err) {
            return res.status(500).send('Database error: ' + err.message);
        }
        
        // Now fetch pets with proper column names
        const sql = `
            SELECT p.*, u.username 
            FROM pets p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.deleted = 0
            ORDER BY p.created_at DESC
        `;
        
        connection.query(sql, (err, results) => {
            if (err) {
                // Try a simpler query without JOIN
                const simpleSql = "SELECT * FROM pets WHERE deleted = 0";
                connection.query(simpleSql, (err2, simpleResults) => {
                    if (err2) {
                        return res.status(500).send('Error loading pets: ' + err2.message);
                    }
                    res.render('index', { 
                        pets: simpleResults,
                        user: req.session.user || null,
                        messages: req.flash('success'),
                        errors: req.flash('error')
                    });
                });
                return;
            }
            
            res.render('index', { 
                pets: results,
                user: req.session.user || null,
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
    });
});

// End of part C


//part E Delete
app.get('/deletePet/:id', checkAuthenticated, (req, res) => {

    const pet_id = req.params.id;

    const sql = "UPDATE pets SET deleted = 1 WHERE pet_id = ?";

    connection.query(sql, [pet_id], (err, result) => {
        if (err) {
            throw err;
        }

        req.flash('success', 'Pet moved to Recently Deleted.');
        res.redirect('/pets');
    });

});
// Recently delete
app.get('/recentlyDeleted', checkAuthenticated, (req, res) => {

    const sql = "SELECT * FROM pets WHERE deleted = 1";

    connection.query(sql, (err, results) => {

        if (err) {
            throw err;
        }

        res.render('recentlyDeleted', {
            pets: results,
            user: req.session.user
        });

    });

});
//restore deleted
app.get('/restorePet/:id', checkAuthenticated, (req, res) => {

    const pe_id = req.params.id;

    const sql = "UPDATE pets SET deleted = 0 WHERE pet_id = ?";

    connection.query(sql, [pet_id], (err, result) => {

        if (err) {
            throw err;
        }

        req.flash('success', 'Pet restored successfully.');
        res.redirect('/recentlyDeleted');

    });

});
//Permanently delete
app.get('/permanentDelete/:id', checkAuthenticated, (req, res) => {

    const pet_id = req.params.id;

    const sql = "DELETE FROM pets WHERE pet_id = ?";

    connection.query(sql, [pet_id], (err, result) => {

        if (err) {
            throw err;
        }

        req.flash('success', 'Pet permanently deleted.');
        res.redirect('/recentlyDeleted');

    });

});
//part E end
// PART F: SEARCHING, FILTERING AND ORGANISING INFORMATION (Irzan 25021343)

app.get('/filter', (req, res) => {
    const sqlType = "SELECT DISTINCT animal_type FROM pets ORDER BY animal_type ASC";
    const sqlBreed = "SELECT DISTINCT breed FROM pets ORDER BY breed ASC";
    const sqlAge   = "SELECT DISTINCT age FROM pets ORDER BY age ASC";

    // Run queries in parallel
    connection.query(sqlType, (err, type) => {
        if (err) throw err;
        connection.query(sqlBreed, (err, breeds) => {
            if (err) throw err;
            connection.query(sqlAge, (err, ages) => {
                if (err) throw err;
                res.render('filter', {
                    breeds: breeds,
                    type: type,
                    ages: ages,
                    user: req.session.user
                });
            });
        });
    });
});

app.get('/filtered', (req, res) => {
    const keyword = req.query.search;
    const breed = req.query['breed[]'];
    const type = req.query['animal_type[]'];
    const age = req.query['age[]'];

    let sql = "SELECT * FROM pets WHERE 1=1";
    const values = [];

    // If keyword search is provided
    if (keyword) {
        sql += " AND (pet_name LIKE ? OR description LIKE ?)";
        values.push(`%${keyword}%`, `%${keyword}%`);
    }

    // If filters are provided
    if (breed) {
        sql += " AND breed IN (?)";
        values.push(Array.isArray(breed) ? breed : [breed]);
    }
    if (type) {
        sql += " AND animal_type IN (?)";
        values.push(Array.isArray(type) ? type : [type]);
    }
    if (age) {
        sql += " AND age IN (?)";
        values.push(Array.isArray(age) ? age : [age]);
    }

    connection.query(sql, values, (err, results) => {
        if (err) throw err;
        res.render('filtered', { pet: results, user: req.session.user });
    });
});

app.get('/pets/details/:id', (req, res) => {
    const petId = req.params.id;

    const sql = "SELECT * FROM pets WHERE pet_id = ?";
    connection.query(sql, [petId], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send("Pet not found");
        }

        // Render a details page with the pet info
        res.render('petDetails', { pet: results[0], user: req.session.user });
    });
});

// END OF PART F

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
