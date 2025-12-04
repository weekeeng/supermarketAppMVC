const ProductsModel = require('../models/Products');

const ProductsController = {

    // ============================
    // PRODUCT VIEWS
    // ============================
    listProductsView: (req, res) => {
        ProductsModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('inventory', { products, user: req.session.user });
        });
    },

    listProductsViewShopping: (req, res) => {
        ProductsModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('shopping', { products, user: req.session.user });
        });
    },

    getProductByIdView: (req, res) => {
        ProductsModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');

            res.render('product', {
                product: results[0],
                user: req.session.user
            });
        });
    },

    getProductByIdEditView: (req, res) => {
        ProductsModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');

            res.render('editProduct', {
                product: results[0],
                user: req.session.user
            });
        });
    },

    // ============================
    // CRUD
    // ============================
    addProductView: (req, res) => {
        const product = req.body;
        if (req.file) product.image = req.file.filename;

        ProductsModel.addProduct(product, (err) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    updateProductView: (req, res) => {
        const id = req.params.id;
        const product = req.body;
        if (req.file) product.image = req.file.filename;

        ProductsModel.updateProduct(id, product, (err) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    deleteProductView: (req, res) => {
        ProductsModel.deleteProduct(req.params.id, (err) => {
            if (err) {
                req.flash('error', 'Database error');
                return res.redirect('/inventory');
            }
            res.redirect('/inventory');
        });
    },

    // ============================
    // CART FUNCTIONS
    // ============================
    addToCart: (req, res) => {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;

        ProductsModel.getProductById(productId, (err, results) => {
            if (err || !results.length) {
                req.flash('error', 'Product not found');
                return res.redirect('/shopping');
            }

            const product = results[0];
            if (!req.session.cart) req.session.cart = [];

            const existing = req.session.cart.find(item => item.id === product.id);

            if (existing) {
                existing.quantity = quantity;
            } else {
                req.session.cart.push({ ...product, quantity });
            }

            res.redirect('/cart');
        });
    },

    updateCartQuantity: (req, res) => {
        const cart = req.session.cart || [];
        const productId = parseInt(req.params.id);
        const quantity = parseInt(req.body.quantity);

        const item = cart.find(i => parseInt(i.id) === productId);
        if (item && quantity > 0) item.quantity = quantity;

        req.session.cart = cart;
        res.redirect('/cart');
    },

    removeFromCart: (req, res) => {
        req.session.cart = (req.session.cart || [])
            .filter(i => parseInt(i.id) !== parseInt(req.params.id));
        res.redirect('/cart');
    },

    // ============================
    // CHECKOUT
    // ============================
    checkoutView: (req, res) => {
        const cart = req.session.cart || [];

        if (!cart.length) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        const total = cart
            .reduce((sum, item) =>
                sum + item.price * item.quantity, 0)
            .toFixed(2);

        res.render('checkout', { cart, total, user: req.session.user });
    },

    // ============================
    // PLACE ORDER + REDUCE STOCK
    // ============================
    placeOrderView: (req, res) => {
        const cart = req.session.cart || [];

        if (!cart.length) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        const { fullName, address, contact, paymentMethod } = req.body;

        if (!fullName || !address || !contact || !paymentMethod) {
            req.flash('error', 'Please fill all fields');
            return res.redirect('/checkout');
        }

        const total = cart
            .reduce((sum, item) =>
                sum + item.price * item.quantity, 0)
            .toFixed(2);

        let i = 0;
        let errors = [];

        const processNext = () => {
            if (i >= cart.length) {

                // If any stock updates failed
                if (errors.length) {
                    req.flash('error', 'Stock update failed. Please try again.');
                    return res.redirect('/cart');
                }

                // Save order to session
                const order = {
                    id: Date.now(),
                    fullName,
                    address,
                    contact,
                    paymentMethod,
                    cart,
                    total,
                    createdAt: new Date()
                };

                if (!req.session.orders) req.session.orders = [];
                req.session.orders.push(order);

                req.session.cart = []; // clear cart

                return res.render('orderConfirmation', {
                    order,
                    user: req.session.user
                });
            }

            const item = cart[i];
            const qty = parseInt(item.quantity);

            if (qty <= 0) {
                i++;
                return processNext();
            }

            ProductsModel.decrementQuantity(item.id, qty, (err, result) => {
                if (err) {
                    errors.push(err);
                } else if (result.affectedRows === 0) {
                    errors.push(new Error(`Failed to update product ${item.id}`));
                }

                i++;
                processNext();
            });
        };

        processNext();
    }
};

module.exports = ProductsController;
