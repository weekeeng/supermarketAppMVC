const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');

require('dotenv').config();

// Services
const netsService = require('./services/nets');
const paypalService = require('./services/paypal');

// Controllers
const ProductsController = require('./controllers/ProductsController');
const UsersController = require('./controllers/UsersController');

const app = express();

// ----------------- Multer setup -----------------
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
    cookie: { maxAge: 1000*60*60*24 }
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

// ----------------- ROUTES -----------------

// Home
app.get('/', (req, res) => res.render('homepage', { user: req.session.user }));

// Shopping
app.get('/shopping', checkAuthenticated, ProductsController.listProductsViewShopping);
app.get('/product/:id', checkAuthenticated, ProductsController.getProductByIdView);

// Admin
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.listProductsView);
app.get('/addProduct', checkAuthenticated, checkAdmin, (req,res)=>res.render('addProduct',{user:req.session.user}));
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.addProductView);
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductsController.getProductByIdEditView);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.updateProductView);
app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductsController.deleteProductView);

// Cart
app.get('/cart', checkAuthenticated, (req,res)=>{
    const cart = req.session.cart || [];
    res.render('cart',{cart,user:req.session.user});
});
app.post('/add-to-cart/:id', checkAuthenticated, ProductsController.addToCart);
app.post('/update-cart/:id', checkAuthenticated, ProductsController.updateCartQuantity);
app.post('/remove-from-cart/:id', checkAuthenticated, ProductsController.removeFromCart);

// Checkout
app.get('/checkout', checkAuthenticated, ProductsController.checkoutView);

// Handle checkout form
app.post('/checkout', checkAuthenticated, (req,res)=>{
    const { paymentMethod } = req.body;
    req.session.delivery = req.body;

    if(paymentMethod === 'NETQR') return res.redirect('/payment/netqr');
    if(paymentMethod === 'PayPal') return res.redirect('/payment/paypal');

    req.flash('error','Invalid payment method');
    res.redirect('/checkout');
});

// ----------------- NETS QR Payment -----------------
app.get('/payment/netqr', checkAuthenticated, async (req,res)=>{
    const cart = req.session.cart || [];
    if(cart.length===0) return res.redirect('/cart');

    const total = cart.reduce((sum,item)=>sum + item.price*item.quantity, 0);

    try {
        const netsData = await netsService.generateQrCode(total);
        req.session.netsTxnRef = netsData.txn_retrieval_ref;

        res.render('netsQr',{
            title:'Scan NETS QR',
            qrCodeUrl:`data:image/png;base64,${netsData.qr_code}`,
            txnRetrievalRef:netsData.txn_retrieval_ref,
            total,
            networkStatus: netsData.network_status
        });
    } catch(err){
        console.error(err);
        res.render('paymentFailed',{message:"NETS QR generation failed"});
    }
});

// NETS QR success/fail simulation
app.get('/payment/netqr/success', checkAuthenticated, async (req,res)=>{
    await ProductsController.placeOrderView(req,res);
    res.render('paymentSuccess',{message:"NETS Payment Successful"});
});
app.get('/payment/netqr/fail', checkAuthenticated,(req,res)=>{
    res.render('paymentFailed',{message:"NETS Payment Failed"});
});

// ----------------- PayPal Payment -----------------
app.get('/payment/paypal', checkAuthenticated, async (req,res)=>{
    const cart = req.session.cart || [];
    if(cart.length===0) return res.redirect('/cart');

    const total = cart.reduce((sum,item)=>sum + item.price*item.quantity, 0);

    try {
        const order = await paypalService.createOrder(total.toFixed(2));
        req.session.paypalOrderId = order.id;

        res.render('payment',{
            orderId: order.id,
            totalAmount: total
        });
    } catch(err){
        console.error(err);
        res.render('paymentFailed',{message:"Error creating PayPal order"});
    }
});

// PayPal capture route
app.post('/paypal-capture', checkAuthenticated, async (req,res)=>{
    const { orderId } = req.body;

    try {
        const captureData = await paypalService.captureOrder(orderId);
        if(captureData.status==='COMPLETED'){
            await ProductsController.placeOrderView(req,res);
            return res.json({success:true, redirectUrl:'/payment/paypal/success'});
        }

        res.json({success:false, redirectUrl:'/payment/paypal/fail'});
    } catch(err){
        console.error(err);
        res.json({success:false, redirectUrl:'/payment/paypal/fail'});
    }
});

app.get('/payment/paypal/success', checkAuthenticated,(req,res)=>{
    res.render('paymentSuccess',{message:"PayPal Payment Successful"});
});
app.get('/payment/paypal/fail', checkAuthenticated,(req,res)=>{
    res.render('paymentFailed',{message:"PayPal Payment Failed"});
});
// homepage
app.get('/', (req, res) => res.render('homepage', { user: req.session.user }));

// ----------------- User -----------------
app.get('/register', (req,res)=>res.render('register',{messages:req.flash('error'),formData:req.flash('formData')[0]}));
app.post('/register', validateRegistration, UsersController.registerUser);

app.get('/login',(req,res)=>res.render('login',{messages:req.flash('success'),errors:req.flash('error')}));
app.post('/login', UsersController.loginUser);

app.get('/logout',(req,res)=>{req.session.destroy();res.redirect('/')});

// ----------------- Start -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
