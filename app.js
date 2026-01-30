const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const QRCode = require('qrcode');
require('dotenv').config();

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
app.use(express.json());

// ----------------- Session + flash -----------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(flash());

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

// ----------------- NETS HELPER FUNCTION -----------------
async function createNetsTransaction(amount) {
    const response = await axios.post(
        "https://uat.nets.openapipaas.com/merchant/v1/qr/dynamic",
        {
            txn_amount: amount * 100,
            currency_code: "SGD"
        },
        {
            headers: {
                "apikey": process.env.API_KEY,
                "projectid": process.env.PROJECT_ID,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data;
}


// ----------------- ROUTES -----------------

// Home
app.get('/', (req, res) => {
    res.render('homepage', { user: req.session.user });
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

app.post('/add-to-cart/:id', checkAuthenticated, ProductsController.addToCart);
app.post('/update-cart/:id', checkAuthenticated, ProductsController.updateCartQuantity);
app.post('/remove-from-cart/:id', checkAuthenticated, ProductsController.removeFromCart);

// ----------------- CHECKOUT ROUTES -----------------

app.get('/checkout', checkAuthenticated, ProductsController.checkoutView);

// New: save delivery info and redirect to payment
app.post('/checkout', checkAuthenticated, (req, res) => {
    req.session.delivery = req.body;
    res.redirect('/payment');
});

// ❗ DO NOT use place-order directly anymore from checkout page
app.post('/place-order', checkAuthenticated, ProductsController.placeOrderView);


// ----------------- PAYMENT ROUTES (CA2) -----------------

app.get('/payment', checkAuthenticated, async (req, res) => {
    const cart = req.session.cart || [];

    if (cart.length === 0) {
        req.flash('error', 'Cart is empty');
        return res.redirect('/cart');
    }

    // Calculate total amount
    let totalAmount = 0;
    cart.forEach(item => {
        totalAmount += item.price * item.quantity;
    });

    try {
        const netsData = await createNetsTransaction(totalAmount);
        const qrImage = await QRCode.toDataURL(netsData.qr_code);

        // store NETS references in session
        req.session.txn_id = netsData.txn_id;
        req.session.txn_ref = netsData.txn_retrieval_ref;

        res.render('payment', { qrImage, totalAmount });

    } catch (err) {
        console.error(err);
        res.render('paymentFailed', { message: "Unable to create NETS transaction" });
    }
});


// After user scans QR and clicks "I Have Paid"
app.get('/check-payment', checkAuthenticated, async (req, res) => {

    try {
        // For CA2 demo we simulate success
        const paymentSuccess = true;

        if (paymentSuccess) {

            // ✅ Only place order AFTER payment success
            await ProductsController.placeOrderView(req, res);

            // show success page
            return res.render('paymentSuccess', {
                message: "Transaction Successful"
            });

        } else {
            return res.render('paymentFailed', {
                message: "Transaction Failed"
            });
        }

    } catch (err) {
        console.error(err);
        res.render('paymentFailed', {
            message: "Error verifying payment"
        });
    }
});


// ----------------- USER ACCOUNT ROUTES -----------------

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});
app.post('/register', validateRegistration, UsersController.registerUser);

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});
app.post('/login', UsersController.loginUser);

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
