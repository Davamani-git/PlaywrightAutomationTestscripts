# Low-Level Design Document (LLD)
## Generated from HLD: DavTest5_HLD.md

# Online Shopping Platform - Low-Level Design Document

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Deployment Architecture](#deployment-architecture)

## Component Specifications

### 1. User Service Component

#### Class Structure
```javascript
class UserService {
  constructor(database, authProvider, encryptionService) {
    this.db = database;
    this.auth = authProvider;
    this.encryption = encryptionService;
  }

  async registerUser(userData) {
    // Input validation
    const validatedData = this.validateUserInput(userData);
    
    // Password encryption
    const hashedPassword = await this.encryption.hashPassword(validatedData.password);
    
    // Create user record
    const user = await this.db.users.create({
      ...validatedData,
      password: hashedPassword,
      userId: this.generateUUID(),
      createdAt: new Date(),
      isActive: true
    });
    
    // Audit logging
    await this.auditLog('USER_REGISTRATION', user.userId);
    
    return this.sanitizeUserData(user);
  }

  async authenticateUser(email, password) {
    const user = await this.db.users.findByEmail(email);
    
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    const isValidPassword = await this.encryption.verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      await this.auditLog('FAILED_LOGIN_ATTEMPT', user.userId);
      throw new AuthenticationError('Invalid credentials');
    }
    
    const token = this.auth.generateJWT({
      userId: user.userId,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    });
    
    await this.auditLog('SUCCESSFUL_LOGIN', user.userId);
    
    return { user: this.sanitizeUserData(user), token };
  }

  validateUserInput(userData) {
    const schema = {
      email: { type: 'string', format: 'email', required: true },
      password: { type: 'string', minLength: 8, required: true },
      firstName: { type: 'string', maxLength: 50, required: true },
      lastName: { type: 'string', maxLength: 50, required: true },
      phone: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' }
    };
    
    return this.jsonSchemaValidator.validate(userData, schema);
  }
}
```

#### Configuration
```yaml
userService:
  database:
    connection: postgresql://user:pass@localhost:5432/ecommerce
    pool:
      min: 5
      max: 20
  jwt:
    secret: ${JWT_SECRET}
    expirationTime: 3600
  encryption:
    algorithm: bcrypt
    saltRounds: 12
  rateLimit:
    windowMs: 900000 # 15 minutes
    max: 5 # limit each IP to 5 requests per windowMs
```

### 2. Product Service Component

#### Class Structure
```javascript
class ProductService {
  constructor(database, searchEngine, cacheService) {
    this.db = database;
    this.search = searchEngine;
    this.cache = cacheService;
  }

  async createProduct(productData, sellerId) {
    // Validate seller permissions
    await this.validateSellerPermissions(sellerId);
    
    // Input validation
    const validatedData = this.validateProductInput(productData);
    
    // Create product
    const product = await this.db.products.create({
      ...validatedData,
      productId: this.generateUUID(),
      sellerId,
      createdAt: new Date(),
      isActive: true
    });
    
    // Index in Elasticsearch
    await this.search.index('products', product.productId, {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      price: product.price,
      sellerId: product.sellerId
    });
    
    // Invalidate cache
    await this.cache.del(`products:category:${product.categoryId}`);
    
    return product;
  }

  async searchProducts(query, filters, pagination) {
    const cacheKey = `search:${JSON.stringify({ query, filters, pagination })}`;
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Build Elasticsearch query
    const searchQuery = {
      bool: {
        must: [
          {
            multi_match: {
              query: query,
              fields: ['name^3', 'description^2', 'category.name']
            }
          }
        ],
        filter: this.buildFilters(filters)
      }
    };
    
    const results = await this.search.search('products', {
      query: searchQuery,
      from: pagination.offset,
      size: pagination.limit,
      sort: [{ _score: { order: 'desc' } }]
    });
    
    // Cache results for 5 minutes
    await this.cache.setex(cacheKey, 300, JSON.stringify(results));
    
    return results;
  }

  buildFilters(filters) {
    const filterClauses = [];
    
    if (filters.categoryId) {
      filterClauses.push({ term: { categoryId: filters.categoryId } });
    }
    
    if (filters.priceRange) {
      filterClauses.push({
        range: {
          price: {
            gte: filters.priceRange.min,
            lte: filters.priceRange.max
          }
        }
      });
    }
    
    if (filters.rating) {
      filterClauses.push({
        range: {
          rating: { gte: filters.rating }
        }
      });
    }
    
    return filterClauses;
  }
}
```

### 3. Order Service Component

#### Class Structure
```javascript
class OrderService {
  constructor(database, paymentService, notificationService, inventoryService) {
    this.db = database;
    this.payment = paymentService;
    this.notification = notificationService;
    this.inventory = inventoryService;
  }

  async createOrder(userId, cartItems, shippingAddress, paymentMethod) {
    const transaction = await this.db.beginTransaction();
    
    try {
      // Validate inventory availability
      await this.validateInventory(cartItems);
      
      // Calculate total amount
      const totalAmount = await this.calculateTotal(cartItems);
      
      // Create order
      const order = await this.db.orders.create({
        orderId: this.generateUUID(),
        userId,
        totalAmount,
        status: 'PENDING',
        shippingAddress,
        paymentMethod,
        createdAt: new Date()
      }, { transaction });
      
      // Create order items
      const orderItems = await Promise.all(
        cartItems.map(item => 
          this.db.orderItems.create({
            orderItemId: this.generateUUID(),
            orderId: order.orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice
          }, { transaction })
        )
      );
      
      // Reserve inventory
      await this.inventory.reserveItems(cartItems, { transaction });
      
      // Process payment
      const paymentResult = await this.payment.processPayment({
        orderId: order.orderId,
        amount: totalAmount,
        paymentMethod,
        userId
      });
      
      if (paymentResult.status === 'SUCCESS') {
        await this.db.orders.update(
          { status: 'CONFIRMED', paymentId: paymentResult.paymentId },
          { where: { orderId: order.orderId }, transaction }
        );
        
        // Clear user's cart
        await this.db.cartItems.destroy(
          { where: { cartId: await this.getUserCartId(userId) }, transaction }
        );
        
        await transaction.commit();
        
        // Send confirmation notification
        await this.notification.sendOrderConfirmation(userId, order.orderId);
        
        return { ...order, status: 'CONFIRMED', orderItems };
      } else {
        throw new PaymentError('Payment processing failed');
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateOrderStatus(orderId, newStatus, userId) {
    // Validate status transition
    const order = await this.db.orders.findByPk(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    
    if (!this.isValidStatusTransition(order.status, newStatus)) {
      throw new ValidationError('Invalid status transition');
    }
    
    // Update order
    await this.db.orders.update(
      { status: newStatus, updatedAt: new Date() },
      { where: { orderId } }
    );
    
    // Log status change
    await this.auditLog('ORDER_STATUS_CHANGE', {
      orderId,
      oldStatus: order.status,
      newStatus,
      userId
    });
    
    // Send notification
    await this.notification.sendStatusUpdate(order.userId, orderId, newStatus);
    
    return await this.db.orders.findByPk(orderId);
  }
}
```

## Data Flow Diagrams

### User Registration Flow
```
User Input → Input Validation → Password Encryption → Database Storage
     ↓
Audit Logging → Response Sanitization → JWT Generation → User Response
```

### Product Search Flow
```
Search Query → Cache Check → Elasticsearch Query → Result Processing
      ↓              ↓               ↓              ↓
   Cache Hit    Cache Miss    Index Search    Cache Update
      ↓              ↓               ↓              ↓
   Return Cache   Build Query   Format Results  Return Results
```

### Order Processing Flow
```
Cart Items → Inventory Check → Price Calculation → Order Creation
     ↓             ↓               ↓                ↓
Payment Process → Transaction → Notification → Order Confirmation
     ↓             ↓               ↓                ↓
Inventory Reserve → Commit/Rollback → Email/SMS → Response
```

## Sequence Diagrams

### User Authentication Sequence
```
User → API Gateway → User Service → Database → Encryption Service
  |        |            |            |           |
  |   POST /login      |            |           |
  |        |       Validate Input    |           |
  |        |            |       Query User       |
  |        |            |            |      Verify Password
  |        |            |            |           |
  |        |       Generate JWT      |           |
  |        |            |       Audit Log       |
  |   200 + JWT        |            |           |
  |        |            |            |           |
```

### Order Creation Sequence
```
User → Order Service → Inventory Service → Payment Service → Notification Service
  |         |               |                 |                 |
  |    Create Order         |                 |                 |
  |         |        Check Availability       |                 |
  |         |               |          Process Payment         |
  |         |               |                 |           Send Confirmation
  |         |        Reserve Items            |                 |
  |         |               |           Update Status          |
  |    Order Created        |                 |                 |
  |         |               |                 |                 |
```

## Implementation Details

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    role user_role_enum DEFAULT 'CUSTOMER',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
```

#### Products Table
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    seller_id UUID NOT NULL REFERENCES users(user_id),
    category_id UUID NOT NULL REFERENCES categories(category_id),
    inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0),
    images JSONB DEFAULT '[]',
    rating DECIMAL(3,2) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_rating ON products(rating);
CREATE INDEX idx_products_active ON products(is_active);
```

#### Orders Table
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status order_status_enum DEFAULT 'PENDING',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipping_address JSONB NOT NULL,
    payment_method payment_method_enum NOT NULL,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);
```

### API Specifications

#### User Service APIs

```yaml
/api/v1/users/register:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password, firstName, lastName]
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
                pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'
              firstName:
                type: string
                maxLength: 50
              lastName:
                type: string
                maxLength: 50
              phone:
                type: string
                pattern: '^\+?[1-9]\d{1,14}$'
    responses:
      201:
        description: User created successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                userId:
                  type: string
                  format: uuid
                email:
                  type: string
                firstName:
                  type: string
                lastName:
                  type: string
                role:
                  type: string
                  enum: [CUSTOMER, SELLER, ADMIN]
      400:
        description: Validation error
      409:
        description: Email already exists

/api/v1/users/login:
  post:
    summary: Authenticate user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password]
            properties:
              email:
                type: string
                format: email
              password:
                type: string
    responses:
      200:
        description: Authentication successful
        content:
          application/json:
            schema:
              type: object
              properties:
                user:
                  $ref: '#/components/schemas/User'
                token:
                  type: string
                expiresAt:
                  type: string
                  format: date-time
      401:
        description: Invalid credentials
```

#### Product Service APIs

```yaml
/api/v1/products:
  get:
    summary: Search products
    parameters:
      - name: q
        in: query
        schema:
          type: string
        description: Search query
      - name: category
        in: query
        schema:
          type: string
          format: uuid
      - name: minPrice
        in: query
        schema:
          type: number
      - name: maxPrice
        in: query
        schema:
          type: number
      - name: rating
        in: query
        schema:
          type: number
          minimum: 0
          maximum: 5
      - name: page
        in: query
        schema:
          type: integer
          minimum: 1
          default: 1
      - name: limit
        in: query
        schema:
          type: integer
          minimum: 1
          maximum: 100
          default: 20
    responses:
      200:
        description: Products found
        content:
          application/json:
            schema:
              type: object
              properties:
                products:
                  type: array
                  items:
                    $ref: '#/components/schemas/Product'
                pagination:
                  $ref: '#/components/schemas/Pagination'
                totalCount:
                  type: integer

  post:
    summary: Create new product
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [name, description, price, categoryId, inventory]
            properties:
              name:
                type: string
                maxLength: 255
              description:
                type: string
              price:
                type: number
                minimum: 0
              categoryId:
                type: string
                format: uuid
              inventory:
                type: integer
                minimum: 0
              images:
                type: array
                items:
                  type: string
                  format: uri
    responses:
      201:
        description: Product created successfully
      400:
        description: Validation error
      401:
        description: Unauthorized
      403:
        description: Insufficient permissions
```

### Security Implementation

#### Input Validation Middleware
```javascript
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    req.validatedBody = value;
    next();
  };
};
```

#### Authentication Middleware
```javascript
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token blacklist
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    
    // Fetch user details
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
```

#### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:'
    }),
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Different limits for different endpoints
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts, please try again later'
);

const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many API requests, please try again later'
);
```

#### Encryption Service
```javascript
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
  }
  
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }
  
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
  
  encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }
  
  decrypt(encryptedData, key) {
    const decipher = crypto.createDecipher(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### Deployment Architecture

#### Docker Configuration

```dockerfile
# User Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npm", "start"]
```

#### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: ecommerce/user-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
---
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Infrastructure as Code (Terraform)

```hcl
# VPC Configuration
resource "aws_vpc" "ecommerce_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "ecommerce-vpc"
    Environment = var.environment
  }
}

# EKS Cluster
resource "aws_eks_cluster" "ecommerce_cluster" {
  name     = "ecommerce-cluster"
  role_arn = aws_iam_role.eks_cluster_role.arn
  version  = "1.27"

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks_encryption.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller,
  ]
}

# RDS PostgreSQL
resource "aws_db_instance" "ecommerce_db" {
  identifier = "ecommerce-db"
  
  engine         = "postgres"
  engine_version = "15.3"
  instance_class = "db.r6g.large"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds_encryption.arn
  
  db_name  = "ecommerce"
  username = "postgres"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.ecommerce.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  deletion_protection = true
  skip_final_snapshot = false
  
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring.arn
  
  tags = {
    Name = "ecommerce-database"
    Environment = var.environment
  }
}

# ElastiCache Redis
resource "aws_elasticache_replication_group" "ecommerce_redis" {
  replication_group_id       = "ecommerce-redis"
  description               = "Redis cluster for ecommerce platform"
  
  node_type                 = "cache.r6g.large"
  port                      = 6379
  parameter_group_name      = "default.redis7"
  
  num_cache_clusters        = 3
  
  subnet_group_name         = aws_elasticache_subnet_group.ecommerce.name
  security_group_ids        = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = var.redis_auth_token
  
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"
  
  tags = {
    Name = "ecommerce-redis"
    Environment = var.environment
  }
}
```

## Monitoring and Observability

### Application Metrics

```javascript
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeUsers = new prometheus.Gauge({
  name: 'active_users_total',
  help: 'Number of currently active users'
});

const orderProcessingTime = new prometheus.Histogram({
  name: 'order_processing_duration_seconds',
  help: 'Time taken to process orders',
  buckets: [1, 5, 10, 30, 60, 300]
});

// Middleware for request metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
};
```

### Health Check Endpoints

```javascript
class HealthCheckService {
  constructor(dependencies) {
    this.db = dependencies.database;
    this.redis = dependencies.redis;
    this.elasticsearch = dependencies.elasticsearch;
  }
  
  async checkHealth() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      elasticsearch: await this.checkElasticsearch(),
      memory: this.checkMemory(),
      disk: await this.checkDisk()
    };
    
    const isHealthy = Object.values(checks).every(check => check.status === 'healthy');
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0'
    };
  }
  
  async checkDatabase() {
    try {
      const start = Date.now();
      await this.db.query('SELECT 1');
      const responseTime = Date.now() - start;
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  async checkRedis() {
    try {
      const start = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - start;
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for all components identified in the High-Level Design, including complete code examples, database schemas, API specifications, security implementations, and deployment configurations. The design ensures enterprise-grade security, compliance, scalability, and maintainability while following industry best practices.