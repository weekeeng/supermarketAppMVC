const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const app = express();

// Controllers
const ProductsController = require('./controllers/ProductsController');
const UsersController = require('./controllers/UsersController');

// ----------------- Multer setup for file uploads -----------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ----------------- View engine -----------------
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // parse JSON bodies

// ----------------- Session + flash -----------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));
app.use(flash());

// expose session and flash to all views
app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.user = req.session ? req.session.user : null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// ----------------- Middleware -----------------
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password || !address || !contact || !role) {
        req.flash('error', 'All fields are required');
        return res.redirect('/register');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// ----------------- ROUTES -----------------

// Home
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Shopping page
app.get('/shopping', checkAuthenticated, ProductsController.listProductsViewShopping);

// Product details
app.get('/product/:id', checkAuthenticated, ProductsController.getProductByIdView);

// Admin inventory page
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.listProductsView);

// Admin: Add product
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addProduct', { user: req.session.user });
});
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.addProductView);

// Admin: Update product
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductsController.getProductByIdEditView);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.updateProductView);

// Admin: Delete product
app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductsController.deleteProductView);

// ----------------- CART ROUTES -----------------

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

// Add to cart
app.post('/add-to-cart/:id', checkAuthenticated, ProductsController.addToCart);

// Update cart item quantity
app.post('/update-cart/:id', checkAuthenticated, ProductsController.updateCartQuantity);

// Remove from cart
app.post('/remove-from-cart/:id', checkAuthenticated, ProductsController.removeFromCart);

// ----------------- CHECKOUT ROUTES -----------------

// ⭐ Checkout View
app.get('/checkout', checkAuthenticated, ProductsController.checkoutView);

// ⭐ Place Order — updates product quantities
app.post('/place-order', checkAuthenticated, ProductsController.placeOrderView);

// ----------------- USER ACCOUNT ROUTES -----------------

// Register
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});
app.post('/register', validateRegistration, UsersController.registerUser);

// Login
app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});
app.post('/login', UsersController.loginUser);

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
