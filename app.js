const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
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
                res.redirect('/dashboard');
            else
                res.redirect('/dashboard');
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

// PART B: ADDING PETS (Ian nathan quah yu yang 25026099)

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

// END OF PART B

// PART C: VIEWING AND DISPLAYING INFORMATION 

// C1: GET - Main pet listing page with search, filter, and sort functionality
app.get('/pets', (req, res) => {
    const { search, animal_type, sort } = req.query;
    let sql = `
        SELECT p.*, u.username 
        FROM pets p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    // Search functionality - search by pet name, breed, or animal type
    if (search && search.trim()) {
        sql += ` AND (p.pet_name LIKE ? OR p.breed LIKE ? OR p.animal_type LIKE ?)`;
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
    }

    // Filter by animal type
    if (animal_type && animal_type !== '') {
        sql += ` AND p.animal_type = ?`;
        params.push(animal_type);
    }

    // Sorting functionality
    switch(sort) {
        case 'newest':
            sql += ` ORDER BY p.created_at DESC`;
            break;
        case 'oldest':
            sql += ` ORDER BY p.created_at ASC`;
            break;
        case 'name_asc':
            sql += ` ORDER BY p.pet_name ASC`;
            break;
        case 'name_desc':
            sql += ` ORDER BY p.pet_name DESC`;
            break;
        case 'age_asc':
            sql += ` ORDER BY p.age ASC`;
            break;
        case 'age_desc':
            sql += ` ORDER BY p.age DESC`;
            break;
        default:
            sql += ` ORDER BY p.created_at DESC`;
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error fetching pets:', err);
            return res.render('pets', { 
                pets: [], 
                messages: [],
                errors: ['Error loading pets. Please try again.'],
                searchQuery: search || '',
                animalTypeFilter: animal_type || '',
                sortBy: sort || 'newest',
                user: req.session.user
            });
        }

        // Transform image path for display
        const pets = results.map(pet => {
            if (pet.image) {
                pet.image_path = '/images/' + path.basename(pet.image);
            }
            return pet;
        });

        res.render('pets', {
            pets: pets,
            messages: req.flash('success'),
            errors: req.flash('error'),
            searchQuery: search || '',
            animalTypeFilter: animal_type || '',
            sortBy: sort || 'newest',
            user: req.session.user
        });
    });
});

// C2: GET - View individual pet details by ID
app.get('/pets/details/:id', (req, res) => {
    const petId = req.params.id;

    // Validate that petId is a number
    if (isNaN(petId)) {
        req.flash('error', 'Invalid pet ID');
        return res.redirect('/pets');
    }

    const sql = `
        SELECT p.*, u.username, u.email, u.contact, u.address, u.id as owner_id
        FROM pets p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.pet_id = ?
    `;

    connection.query(sql, [petId], (err, results) => {
        if (err) {
            console.error('Error fetching pet details:', err);
            req.flash('error', 'Error loading pet details');
            return res.redirect('/pets');
        }

        if (results.length === 0) {
            req.flash('error', 'Pet not found');
            return res.redirect('/pets');
        }

        const pet = results[0];
        if (pet.image) {
            pet.image_path = '/images/' + path.basename(pet.image);
        }

        // Check if current user is the owner or admin (for edit/delete permissions)
        const isOwner = req.session.user && 
                       (req.session.user.id === pet.owner_id || 
                        req.session.user.role === 'admin');

        res.render('pet-details', {
            pet: pet,
            isOwner: isOwner,
            messages: req.flash('success'),
            errors: req.flash('error'),
            user: req.session.user
        });
    });
});

// C3: GET - View pets filtered by category/type
app.get('/pets/category/:type', (req, res) => {
    const type = req.params.type;
    
    if (!type) {
        return res.redirect('/pets');
    }

    const sql = `
        SELECT p.*, u.username
        FROM pets p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.animal_type = ?
        ORDER BY p.created_at DESC
    `;

    connection.query(sql, [type], (err, results) => {
        if (err) {
            console.error('Error fetching pets by category:', err);
            req.flash('error', 'Error loading pets');
            return res.redirect('/pets');
        }

        const pets = results.map(pet => {
            if (pet.image) {
                pet.image_path = '/images/' + path.basename(pet.image);
            }
            return pet;
        });

        res.render('pets', {
            pets: pets,
            messages: req.flash('success'),
            errors: req.flash('error'),
            searchQuery: '',
            animalTypeFilter: type,
            sortBy: 'newest',
            user: req.session.user
        });
    });
});

// C4: GET - View recently added pets (within last 7 days)
app.get('/pets/recent', (req, res) => {
    const sql = `
        SELECT p.*, u.username
        FROM pets p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY p.created_at DESC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching recent pets:', err);
            req.flash('error', 'Error loading recent pets');
            return res.redirect('/pets');
        }

        const pets = results.map(pet => {
            if (pet.image) {
                pet.image_path = '/images/' + path.basename(pet.image);
            }
            return pet;
        });

        res.render('pets', {
            pets: pets,
            messages: ['Showing pets added in the last 7 days'],
            errors: [],
            searchQuery: '',
            animalTypeFilter: '',
            sortBy: 'newest',
            user: req.session.user
        });
    });
});

// END OF PART C
//part E Delete
app.get('/deletePet/:id', checkAuthenticated, (req, res) => {

    const petId = req.params.id;

    const sql = "UPDATE pets SET deleted = 1 WHERE petId = ?";

    connection.query(sql, [petId], (err, result) => {
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

    const petId = req.params.id;

    const sql = "UPDATE pets SET deleted = 0 WHERE petId = ?";

    connection.query(sql, [petId], (err, result) => {

        if (err) {
            throw err;
        }

        req.flash('success', 'Pet restored successfully.');
        res.redirect('/recentlyDeleted');

    });

});
//Permanently delete
app.get('/permanentDelete/:id', checkAuthenticated, (req, res) => {

    const petId = req.params.id;

    const sql = "DELETE FROM pets WHERE petId = ?";

    connection.query(sql, [petId], (err, result) => {

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
    const sqlType = "SELECT DISTINCT Type FROM pet ORDER BY Type ASC";
    const sqlBreed = "SELECT DISTINCT Breed FROM pet ORDER BY Breed ASC";
    const sqlAge   = "SELECT DISTINCT Age FROM pet ORDER BY Age ASC";

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

    connection.query(sql, values, (err, results) => {
        if (err) throw err;
        res.render('filtered', { pet: results, user: req.session.user });
    });
});

app.get('/pets/:id', (req, res) => {
    const petId = req.params.id;

    const sql = "SELECT * FROM pet WHERE petId = ?";
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
