# Online Shopping Platform - Low-Level Design Document

## 1. Component Architecture

### 1.1 Authentication Service
**Technology Stack:** Node.js, Express.js, JWT, bcrypt
**Database Schema:**
```sql
-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    last_login_at TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP NULL
);

-- User Roles Table
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(user_id),
    role_id UUID REFERENCES roles(role_id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- Roles Table
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens Table
CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL
);
```

**API Endpoints:**
```javascript
// Authentication Controller
class AuthController {
    async register(req, res) {
        const { email, password, firstName, lastName, phoneNumber } = req.body;
        
        // Validation
        const schema = Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
            firstName: Joi.string().min(2).max(50).required(),
            lastName: Joi.string().min(2).max(50).required(),
            phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
        });
        
        const { error } = schema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });
        
        try {
            // Check if user exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({ error: 'User already exists' });
            }
            
            // Hash password
            const saltRounds = 12;
            const passwordHash = await bcrypt.hash(password, saltRounds);
            
            // Create user
            const user = await User.create({
                email,
                passwordHash,
                firstName,
                lastName,
                phoneNumber
            });
            
            // Generate tokens
            const accessToken = jwt.sign(
                { userId: user.userId, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );
            
            const refreshToken = jwt.sign(
                { userId: user.userId },
                process.env.REFRESH_SECRET,
                { expiresIn: '7d' }
            );
            
            // Store refresh token
            await RefreshToken.create({
                userId: user.userId,
                tokenHash: await bcrypt.hash(refreshToken, 10),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            
            res.status(201).json({
                message: 'User registered successfully',
                user: {
                    userId: user.userId,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                },
                accessToken,
                refreshToken
            });
            
        } catch (error) {
            logger.error('Registration error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    
    async login(req, res) {
        const { email, password } = req.body;
        
        try {
            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Check if account is locked
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                return res.status(423).json({ error: 'Account temporarily locked' });
            }
            
            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.passwordHash);
            if (!isValidPassword) {
                // Increment failed attempts
                await User.incrementFailedAttempts(user.userId);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Reset failed attempts and update last login
            await User.resetFailedAttempts(user.userId);
            await User.updateLastLogin(user.userId);
            
            // Generate tokens
            const accessToken = jwt.sign(
                { userId: user.userId, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );
            
            const refreshToken = jwt.sign(
                { userId: user.userId },
                process.env.REFRESH_SECRET,
                { expiresIn: '7d' }
            );
            
            res.json({
                message: 'Login successful',
                user: {
                    userId: user.userId,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                },
                accessToken,
                refreshToken
            });
            
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
```

### 1.2 Product Catalog Service
**Database Schema:**
```sql
-- Categories Table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    slug VARCHAR(100) UNIQUE NOT NULL,
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    price DECIMAL(10,2) NOT NULL,
    category_id UUID REFERENCES categories(category_id),
    brand VARCHAR(100),
    sku VARCHAR(100) UNIQUE NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    weight DECIMAL(8,2),
    dimensions JSONB,
    status VARCHAR(20) DEFAULT 'active',
    featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Images Table
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false
);

-- Product Attributes Table
CREATE TABLE product_attributes (
    attribute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Product Service Implementation:**
```javascript
class ProductService {
    async getProducts(filters = {}) {
        const {
            category,
            minPrice,
            maxPrice,
            brand,
            search,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            page = 1,
            limit = 20
        } = filters;
        
        let query = `
            SELECT 
                p.*,
                c.name as category_name,
                c.slug as category_slug,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'image_id', pi.image_id,
                            'image_url', pi.image_url,
                            'alt_text', pi.alt_text,
                            'is_primary', pi.is_primary
                        ) ORDER BY pi.sort_order
                    ) FILTER (WHERE pi.image_id IS NOT NULL),
                    '[]'::json
                ) as images
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN product_images pi ON p.product_id = pi.product_id
            WHERE p.status = 'active'
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (category) {
            query += ` AND c.slug = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        if (minPrice) {
            query += ` AND p.price >= $${paramIndex}`;
            params.push(minPrice);
            paramIndex++;
        }
        
        if (maxPrice) {
            query += ` AND p.price <= $${paramIndex}`;
            params.push(maxPrice);
            paramIndex++;
        }
        
        if (brand) {
            query += ` AND p.brand ILIKE $${paramIndex}`;
            params.push(`%${brand}%`);
            paramIndex++;
        }
        
        if (search) {
            query += ` AND (
                p.name ILIKE $${paramIndex} OR 
                p.description ILIKE $${paramIndex} OR 
                p.short_description ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ` GROUP BY p.product_id, c.name, c.slug`;
        query += ` ORDER BY p.${sortBy} ${sortOrder}`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        
        params.push(limit, (page - 1) * limit);
        
        const result = await db.query(query, params);
        return result.rows;
    }
    
    async getProductById(productId) {
        const query = `
            SELECT 
                p.*,
                c.name as category_name,
                c.slug as category_slug,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'image_id', pi.image_id,
                            'image_url', pi.image_url,
                            'alt_text', pi.alt_text,
                            'is_primary', pi.is_primary
                        ) ORDER BY pi.sort_order
                    ) FILTER (WHERE pi.image_id IS NOT NULL),
                    '[]'::json
                ) as images,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'attribute_name', pa.attribute_name,
                            'attribute_value', pa.attribute_value
                        )
                    ) FILTER (WHERE pa.attribute_id IS NOT NULL),
                    '[]'::json
                ) as attributes
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN product_images pi ON p.product_id = pi.product_id
            LEFT JOIN product_attributes pa ON p.product_id = pa.product_id
            WHERE p.product_id = $1 AND p.status = 'active'
            GROUP BY p.product_id, c.name, c.slug
        `;
        
        const result = await db.query(query, [productId]);
        return result.rows[0] || null;
    }
}
```

### 1.3 Shopping Cart Service
**Database Schema:**
```sql
-- Carts Table
CREATE TABLE carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Cart Items Table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES carts(cart_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Cart Service Implementation:**
```javascript
class CartService {
    async addToCart(userId, sessionId, productId, quantity) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Get or create cart
            let cart = await this.getCart(userId, sessionId, client);
            if (!cart) {
                cart = await this.createCart(userId, sessionId, client);
            }
            
            // Check product availability
            const product = await this.getProduct(productId, client);
            if (!product) {
                throw new Error('Product not found');
            }
            
            if (product.stock_quantity < quantity) {
                throw new Error('Insufficient stock');
            }
            
            // Check if item already exists in cart
            const existingItem = await client.query(
                'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2',
                [cart.cart_id, productId]
            );
            
            if (existingItem.rows.length > 0) {
                // Update existing item
                const newQuantity = existingItem.rows[0].quantity + quantity;
                if (newQuantity > product.stock_quantity) {
                    throw new Error('Insufficient stock for requested quantity');
                }
                
                await client.query(
                    `UPDATE cart_items 
                     SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
                     WHERE cart_item_id = $2`,
                    [newQuantity, existingItem.rows[0].cart_item_id]
                );
            } else {
                // Add new item
                await client.query(
                    `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price)
                     VALUES ($1, $2, $3, $4)`,
                    [cart.cart_id, productId, quantity, product.price]
                );
            }
            
            // Update cart timestamp
            await client.query(
                'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE cart_id = $1',
                [cart.cart_id]
            );
            
            await client.query('COMMIT');
            
            return await this.getCartWithItems(cart.cart_id);
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    async getCartWithItems(cartId) {
        const query = `
            SELECT 
                c.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'cart_item_id', ci.cart_item_id,
                            'product_id', ci.product_id,
                            'quantity', ci.quantity,
                            'unit_price', ci.unit_price,
                            'total_price', ci.quantity * ci.unit_price,
                            'product_name', p.name,
                            'product_image', pi.image_url,
                            'stock_quantity', p.stock_quantity
                        ) ORDER BY ci.added_at
                    ) FILTER (WHERE ci.cart_item_id IS NOT NULL),
                    '[]'::json
                ) as items,
                COALESCE(SUM(ci.quantity * ci.unit_price), 0) as total_amount
            FROM carts c
            LEFT JOIN cart_items ci ON c.cart_id = ci.cart_id
            LEFT JOIN products p ON ci.product_id = p.product_id
            LEFT JOIN product_images pi ON p.product_id = pi.product_id AND pi.is_primary = true
            WHERE c.cart_id = $1
            GROUP BY c.cart_id
        `;
        
        const result = await db.query(query, [cartId]);
        return result.rows[0] || null;
    }
}
```

### 1.4 Order Management Service
**Database Schema:**
```sql
-- Orders Table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_date TIMESTAMP NULL,
    delivered_date TIMESTAMP NULL,
    notes TEXT
);

-- Order Items Table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

-- Order Status History Table
CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(user_id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);
```

**Order Processing Workflow:**
```javascript
class OrderService {
    async createOrder(userId, cartId, shippingAddress, billingAddress, paymentMethod) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Get cart with items
            const cart = await this.getCartWithItems(cartId, client);
            if (!cart || !cart.items.length) {
                throw new Error('Cart is empty');
            }
            
            // Validate stock availability
            for (const item of cart.items) {
                const product = await this.getProduct(item.product_id, client);
                if (product.stock_quantity < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }
            }
            
            // Generate order number
            const orderNumber = await this.generateOrderNumber();
            
            // Calculate totals
            const subtotal = cart.items.reduce((sum, item) => sum + item.total_price, 0);
            const taxAmount = this.calculateTax(subtotal, shippingAddress);
            const shippingAmount = this.calculateShipping(cart.items, shippingAddress);
            const totalAmount = subtotal + taxAmount + shippingAmount;
            
            // Create order
            const orderResult = await client.query(
                `INSERT INTO orders (
                    user_id, order_number, subtotal, tax_amount, 
                    shipping_amount, total_amount, shipping_address, 
                    billing_address, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                RETURNING order_id`,
                [
                    userId, orderNumber, subtotal, taxAmount,
                    shippingAmount, totalAmount, JSON.stringify(shippingAddress),
                    JSON.stringify(billingAddress), 'pending'
                ]
            );
            
            const orderId = orderResult.rows[0].order_id;
            
            // Create order items and update stock
            for (const item of cart.items) {
                await client.query(
                    `INSERT INTO order_items (
                        order_id, product_id, product_name, product_sku,
                        quantity, unit_price, total_price
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        orderId, item.product_id, item.product_name,
                        item.product_sku, item.quantity, item.unit_price,
                        item.total_price
                    ]
                );
                
                // Update stock
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2',
                    [item.quantity, item.product_id]
                );
            }
            
            // Add status history
            await client.query(
                'INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)',
                [orderId, 'pending', userId]
            );
            
            // Process payment
            const paymentResult = await this.processPayment(orderId, totalAmount, paymentMethod);
            
            if (paymentResult.success) {
                // Update order status
                await client.query(
                    'UPDATE orders SET status = $1 WHERE order_id = $2',
                    ['confirmed', orderId]
                );
                
                await client.query(
                    'INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)',
                    [orderId, 'confirmed', userId]
                );
                
                // Clear cart
                await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
            } else {
                throw new Error('Payment processing failed');
            }
            
            await client.query('COMMIT');
            
            // Send confirmation email
            await this.sendOrderConfirmation(orderId);
            
            return await this.getOrderById(orderId);
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
```

### 1.5 Payment Service
**Database Schema:**
```sql
-- Payments Table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL,
    payment_gateway VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(255),
    gateway_transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow
```
User Input → Validation → Password Hashing → Database Storage → Token Generation → Response
    ↓
Email Verification → Account Activation
```

### 2.2 Product Search Flow
```
Search Query → Input Sanitization → Elasticsearch Query → Cache Check → Database Query → Response Formatting → Client Response
```

### 2.3 Order Processing Flow
```
Cart Validation → Stock Check → Order Creation → Payment Processing → Inventory Update → Notification Dispatch → Order Confirmation
```

## 3. Sequence Diagrams

### 3.1 Authentication Sequence
```
Client -> API Gateway -> Auth Service -> Database -> Auth Service -> Client
   |           |            |             |           |           |
   |    POST /login         |             |           |           |
   |           |    validate credentials  |           |           |
   |           |            |      query user        |           |
   |           |            |             |    user data        |
   |           |            |    generate tokens     |           |
   |           |            |             |           |    tokens |
```

### 3.2 Order Processing Sequence
```
Client -> Cart Service -> Order Service -> Payment Service -> Notification Service
   |           |              |               |                    |
   |    checkout              |               |                    |
   |           |    get cart  |               |                    |
   |           |              |    create order                    |
   |           |              |               |    process payment |
   |           |              |               |                    |    send confirmation
```

## 4. Security Implementation Details

### 4.1 Input Validation
```javascript
const productValidationSchema = Joi.object({
    name: Joi.string().min(2).max(255).required(),
    description: Joi.string().max(5000).optional(),
    price: Joi.number().positive().precision(2).required(),
    categoryId: Joi.string().uuid().required(),
    brand: Joi.string().max(100).optional(),
    sku: Joi.string().alphanum().max(100).required(),
    stockQuantity: Joi.number().integer().min(0).required()
});
```

### 4.2 Output Sanitization
```javascript
const sanitizeOutput = (data) => {
    if (typeof data === 'string') {
        return DOMPurify.sanitize(data);
    }
    if (Array.isArray(data)) {
        return data.map(sanitizeOutput);
    }
    if (typeof data === 'object' && data !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            sanitized[key] = sanitizeOutput(value);
        }
        return sanitized;
    }
    return data;
};
```

### 4.3 Encryption Implementation
```javascript
const crypto = require('crypto');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
    }
    
    encrypt(text, key) {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipher(this.algorithm, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const tag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            tag: tag.toString('hex')
        };
    }
    
    decrypt(encryptedData, key) {
        const decipher = crypto.createDecipher(
            this.algorithm,
            key,
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}
```

## 5. Performance Optimization

### 5.1 Database Indexing Strategy
```sql
-- User authentication indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Product search indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_name_gin ON products USING gin(to_tsvector('english', name));

-- Order processing indexes
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);

-- Cart management indexes
CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_session ON carts(session_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
```

### 5.2 Caching Strategy
```javascript
const Redis = require('redis');
const redis = Redis.createClient();

class CacheService {
    async get(key) {
        try {
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }
    
    async set(key, data, ttl = 3600) {
        try {
            await redis.setex(key, ttl, JSON.stringify(data));
        } catch (error) {
            logger.error('Cache set error:', error);
        }
    }
    
    async del(key) {
        try {
            await redis.del(key);
        } catch (error) {
            logger.error('Cache delete error:', error);
        }
    }
}
```

## 6. Error Handling & Monitoring

### 6.1 Circuit Breaker Implementation
```javascript
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000, monitor = false) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.monitor = monitor;
        this.reset();
    }
    
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.nextAttempt = Date.now();
    }
    
    async call(fn, ...args) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF_OPEN';
        }
        
        try {
            const result = await fn(...args);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.reset();
    }
    
    onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
        }
    }
}
```

### 6.2 Comprehensive Logging
```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'shopping-platform' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});
```

## 7. API Documentation

### 7.1 Authentication Endpoints
```yaml
/api/auth/register:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
              firstName:
                type: string
              lastName:
                type: string
              phoneNumber:
                type: string
    responses:
      201:
        description: User registered successfully
      400:
        description: Validation error
      409:
        description: User already exists
```

### 7.2 Product Endpoints
```yaml
/api/products:
  get:
    summary: Get products with filtering
    parameters:
      - name: category
        in: query
        schema:
          type: string
      - name: minPrice
        in: query
        schema:
          type: number
      - name: maxPrice
        in: query
        schema:
          type: number
      - name: search
        in: query
        schema:
          type: string
      - name: page
        in: query
        schema:
          type: integer
          default: 1
      - name: limit
        in: query
        schema:
          type: integer
          default: 20
    responses:
      200:
        description: List of products
```