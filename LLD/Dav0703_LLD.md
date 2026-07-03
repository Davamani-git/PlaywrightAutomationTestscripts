# Low-Level Design Document - Online Shopping Platform

## Component Specifications

### 1. User Management Service

#### 1.1 User Registration Component

**Class: UserRegistrationService**
```typescript
class UserRegistrationService {
  private emailValidator: EmailValidator
  private passwordValidator: PasswordValidator
  private userRepository: UserRepository
  private emailService: EmailService
  
  async registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult> {
    // Input validation
    const validationResult = await this.validateUserData(userData)
    if (!validationResult.isValid) {
      throw new ValidationError(validationResult.errors)
    }
    
    // Check for duplicate email
    const existingUser = await this.userRepository.findByEmail(userData.email)
    if (existingUser) {
      throw new DuplicateEmailError('Email already exists')
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12)
    
    // Create user entity
    const user = new User({
      userId: generateUUID(),
      email: userData.email,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phoneNumber: userData.phoneNumber,
      role: UserRole.CUSTOMER,
      isActive: false,
      createdAt: new Date()
    })
    
    // Save to database
    await this.userRepository.save(user)
    
    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.userId)
    
    return new UserRegistrationResult(user.userId, 'Registration successful')
  }
  
  private async validateUserData(userData: UserRegistrationData): Promise<ValidationResult> {
    const errors: string[] = []
    
    if (!this.emailValidator.isValid(userData.email)) {
      errors.push('Invalid email format')
    }
    
    if (!this.passwordValidator.isStrong(userData.password)) {
      errors.push('Password must be at least 8 characters with uppercase, lowercase, number, and special character')
    }
    
    return new ValidationResult(errors.length === 0, errors)
  }
}
```

**Database Schema:**
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  role VARCHAR(20) DEFAULT 'CUSTOMER',
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

#### 1.2 Authentication Component

**Class: AuthenticationService**
```typescript
class AuthenticationService {
  private userRepository: UserRepository
  private jwtService: JWTService
  private auditService: AuditService
  private readonly MAX_LOGIN_ATTEMPTS = 3
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes
  
  async authenticateUser(email: string, password: string, ipAddress: string): Promise<AuthenticationResult> {
    const user = await this.userRepository.findByEmail(email)
    
    if (!user) {
      await this.auditService.logFailedLogin(email, ipAddress, 'User not found')
      throw new AuthenticationError('Invalid credentials')
    }
    
    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError('Account temporarily locked')
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      await this.handleFailedLogin(user, ipAddress)
      throw new AuthenticationError('Invalid credentials')
    }
    
    // Reset failed attempts on successful login
    await this.userRepository.resetFailedAttempts(user.userId)
    
    // Generate JWT token
    const token = await this.jwtService.generateToken({
      userId: user.userId,
      email: user.email,
      role: user.role
    })
    
    // Update last login
    await this.userRepository.updateLastLogin(user.userId)
    
    // Log successful login
    await this.auditService.logSuccessfulLogin(user.userId, ipAddress)
    
    return new AuthenticationResult(token, user)
  }
  
  private async handleFailedLogin(user: User, ipAddress: string): Promise<void> {
    const attempts = user.failedLoginAttempts + 1
    
    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      const lockoutUntil = new Date(Date.now() + this.LOCKOUT_DURATION)
      await this.userRepository.lockAccount(user.userId, lockoutUntil)
      await this.auditService.logAccountLockout(user.userId, ipAddress)
    } else {
      await this.userRepository.incrementFailedAttempts(user.userId)
    }
    
    await this.auditService.logFailedLogin(user.email, ipAddress, 'Invalid password')
  }
}
```

### 2. Product Catalog Service

#### 2.1 Product Search Component

**Class: ProductSearchService**
```typescript
class ProductSearchService {
  private elasticsearchClient: ElasticsearchClient
  private cacheService: CacheService
  
  async searchProducts(searchRequest: ProductSearchRequest): Promise<ProductSearchResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(searchRequest)
    const cachedResult = await this.cacheService.get(cacheKey)
    
    if (cachedResult) {
      return cachedResult
    }
    
    // Build Elasticsearch query
    const query = this.buildSearchQuery(searchRequest)
    
    // Execute search
    const searchResponse = await this.elasticsearchClient.search({
      index: 'products',
      body: query
    })
    
    // Process results
    const products = this.processSearchResults(searchResponse)
    
    const result = new ProductSearchResult({
      products,
      totalCount: searchResponse.hits.total.value,
      facets: this.extractFacets(searchResponse.aggregations),
      suggestions: this.generateSuggestions(searchRequest.keyword)
    })
    
    // Cache results for 5 minutes
    await this.cacheService.set(cacheKey, result, 300)
    
    return result
  }
  
  private buildSearchQuery(request: ProductSearchRequest): any {
    const query: any = {
      query: {
        bool: {
          must: [],
          filter: []
        }
      },
      sort: this.buildSortCriteria(request.sortBy),
      from: (request.page - 1) * request.pageSize,
      size: request.pageSize,
      aggs: this.buildAggregations()
    }
    
    // Add keyword search
    if (request.keyword) {
      query.query.bool.must.push({
        multi_match: {
          query: request.keyword,
          fields: ['name^2', 'description', 'category'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      })
    }
    
    // Add filters
    if (request.category) {
      query.query.bool.filter.push({
        term: { 'category.keyword': request.category }
      })
    }
    
    if (request.priceRange) {
      query.query.bool.filter.push({
        range: {
          price: {
            gte: request.priceRange.min,
            lte: request.priceRange.max
          }
        }
      })
    }
    
    // Only active products
    query.query.bool.filter.push({
      term: { is_active: true }
    })
    
    return query
  }
}
```

**Elasticsearch Index Mapping:**
```json
{
  "mappings": {
    "properties": {
      "product_id": { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "description": {
        "type": "text",
        "analyzer": "standard"
      },
      "price": { "type": "double" },
      "category": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "seller_id": { "type": "keyword" },
      "inventory": { "type": "integer" },
      "is_active": { "type": "boolean" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" },
      "image_urls": { "type": "keyword" },
      "rating_average": { "type": "double" },
      "review_count": { "type": "integer" }
    }
  }
}
```

#### 2.2 Inventory Management Component

**Class: InventoryService**
```typescript
class InventoryService {
  private productRepository: ProductRepository
  private notificationService: NotificationService
  private cacheService: CacheService
  
  async reserveInventory(productId: string, quantity: number): Promise<InventoryReservation> {
    // Use distributed lock to prevent race conditions
    const lockKey = `inventory_lock:${productId}`
    const lock = await this.cacheService.acquireLock(lockKey, 5000)
    
    try {
      const product = await this.productRepository.findById(productId)
      
      if (!product) {
        throw new ProductNotFoundError('Product not found')
      }
      
      if (product.inventory < quantity) {
        throw new InsufficientInventoryError('Not enough inventory available')
      }
      
      // Reserve inventory
      const newInventory = product.inventory - quantity
      await this.productRepository.updateInventory(productId, newInventory)
      
      // Check for low stock alert
      if (newInventory <= product.lowStockThreshold) {
        await this.notificationService.sendLowStockAlert(product.sellerId, productId, newInventory)
      }
      
      // Clear cache
      await this.cacheService.delete(`product:${productId}`)
      
      return new InventoryReservation(productId, quantity, newInventory)
      
    } finally {
      await this.cacheService.releaseLock(lockKey)
    }
  }
  
  async releaseInventory(productId: string, quantity: number): Promise<void> {
    const lockKey = `inventory_lock:${productId}`
    const lock = await this.cacheService.acquireLock(lockKey, 5000)
    
    try {
      const product = await this.productRepository.findById(productId)
      
      if (product) {
        const newInventory = product.inventory + quantity
        await this.productRepository.updateInventory(productId, newInventory)
        await this.cacheService.delete(`product:${productId}`)
      }
      
    } finally {
      await this.cacheService.releaseLock(lockKey)
    }
  }
}
```

### 3. Shopping Cart Service

#### 3.1 Cart Management Component

**Class: ShoppingCartService**
```typescript
class ShoppingCartService {
  private cartRepository: CartRepository
  private productService: ProductService
  private cacheService: CacheService
  
  async addItemToCart(userId: string, productId: string, quantity: number): Promise<CartItem> {
    // Validate product exists and has sufficient inventory
    const product = await this.productService.getProduct(productId)
    
    if (!product || !product.isActive) {
      throw new ProductNotFoundError('Product not found or inactive')
    }
    
    if (product.inventory < quantity) {
      throw new InsufficientInventoryError('Not enough inventory available')
    }
    
    // Get or create cart
    let cart = await this.cartRepository.findByUserId(userId)
    
    if (!cart) {
      cart = new ShoppingCart({
        cartId: generateUUID(),
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      await this.cartRepository.save(cart)
    }
    
    // Check if item already exists in cart
    let cartItem = await this.cartRepository.findCartItem(cart.cartId, productId)
    
    if (cartItem) {
      // Update existing item
      const newQuantity = cartItem.quantity + quantity
      
      if (product.inventory < newQuantity) {
        throw new InsufficientInventoryError('Not enough inventory for requested quantity')
      }
      
      cartItem.quantity = newQuantity
      cartItem.updatedAt = new Date()
    } else {
      // Create new cart item
      cartItem = new CartItem({
        cartItemId: generateUUID(),
        cartId: cart.cartId,
        productId,
        quantity,
        addedAt: new Date()
      })
    }
    
    await this.cartRepository.saveCartItem(cartItem)
    
    // Update cart timestamp
    cart.updatedAt = new Date()
    await this.cartRepository.save(cart)
    
    // Clear cart cache
    await this.cacheService.delete(`cart:${userId}`)
    
    return cartItem
  }
  
  async getCartWithItems(userId: string): Promise<CartWithItems> {
    // Check cache first
    const cacheKey = `cart:${userId}`
    const cachedCart = await this.cacheService.get(cacheKey)
    
    if (cachedCart) {
      return cachedCart
    }
    
    const cart = await this.cartRepository.findByUserId(userId)
    
    if (!cart) {
      return new CartWithItems(null, [])
    }
    
    const cartItems = await this.cartRepository.findCartItems(cart.cartId)
    
    // Enrich with product information
    const enrichedItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = await this.productService.getProduct(item.productId)
        return new EnrichedCartItem(item, product)
      })
    )
    
    const result = new CartWithItems(cart, enrichedItems)
    
    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, result, 300)
    
    return result
  }
}
```

### 4. Order Management Service

#### 4.1 Order Processing Component

**Class: OrderProcessingService**
```typescript
class OrderProcessingService {
  private orderRepository: OrderRepository
  private inventoryService: InventoryService
  private paymentService: PaymentService
  private notificationService: NotificationService
  private sagaOrchestrator: SagaOrchestrator
  
  async createOrder(orderRequest: CreateOrderRequest): Promise<Order> {
    // Start distributed transaction using Saga pattern
    const sagaId = generateUUID()
    
    try {
      // Step 1: Validate order items
      const validatedItems = await this.validateOrderItems(orderRequest.items)
      
      // Step 2: Reserve inventory
      const inventoryReservations = await this.reserveInventoryForItems(validatedItems)
      
      // Step 3: Create order entity
      const order = new Order({
        orderId: generateUUID(),
        userId: orderRequest.userId,
        totalAmount: this.calculateTotalAmount(validatedItems),
        status: OrderStatus.PROCESSING,
        shippingAddress: orderRequest.shippingAddress,
        paymentMethod: orderRequest.paymentMethod,
        trackingNumber: this.generateTrackingNumber(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      
      await this.orderRepository.save(order)
      
      // Step 4: Create order items
      const orderItems = validatedItems.map(item => new OrderItem({
        orderItemId: generateUUID(),
        orderId: order.orderId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice
      }))
      
      await this.orderRepository.saveOrderItems(orderItems)
      
      // Step 5: Process payment
      const paymentResult = await this.paymentService.processPayment({
        orderId: order.orderId,
        amount: order.totalAmount,
        paymentMethod: orderRequest.paymentMethod,
        billingAddress: orderRequest.billingAddress
      })
      
      if (!paymentResult.success) {
        // Rollback inventory reservations
        await this.rollbackInventoryReservations(inventoryReservations)
        throw new PaymentProcessingError('Payment failed')
      }
      
      // Step 6: Send notifications
      await this.notificationService.sendOrderConfirmation(order.userId, order.orderId)
      
      // Step 7: Notify sellers
      await this.notifySellerOfNewOrder(orderItems)
      
      return order
      
    } catch (error) {
      // Saga compensation - rollback all changes
      await this.sagaOrchestrator.compensate(sagaId)
      throw error
    }
  }
  
  private async validateOrderItems(items: OrderItemRequest[]): Promise<ValidatedOrderItem[]> {
    const validatedItems: ValidatedOrderItem[] = []
    
    for (const item of items) {
      const product = await this.productService.getProduct(item.productId)
      
      if (!product || !product.isActive) {
        throw new ProductNotFoundError(`Product ${item.productId} not found or inactive`)
      }
      
      if (product.inventory < item.quantity) {
        throw new InsufficientInventoryError(`Not enough inventory for product ${item.productId}`)
      }
      
      validatedItems.push(new ValidatedOrderItem({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        sellerId: product.sellerId
      }))
    }
    
    return validatedItems
  }
}
```

#### 4.2 Order Tracking Component

**Class: OrderTrackingService**
```typescript
class OrderTrackingService {
  private orderRepository: OrderRepository
  private shippingProviderService: ShippingProviderService
  private notificationService: NotificationService
  
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, trackingInfo?: TrackingInfo): Promise<void> {
    const order = await this.orderRepository.findById(orderId)
    
    if (!order) {
      throw new OrderNotFoundError('Order not found')
    }
    
    const previousStatus = order.status
    order.status = newStatus
    order.updatedAt = new Date()
    
    if (trackingInfo) {
      order.trackingNumber = trackingInfo.trackingNumber
      order.carrier = trackingInfo.carrier
    }
    
    await this.orderRepository.save(order)
    
    // Log status change
    await this.orderRepository.addStatusHistory(orderId, {
      previousStatus,
      newStatus,
      timestamp: new Date(),
      notes: trackingInfo?.notes
    })
    
    // Send notification to customer
    await this.notificationService.sendOrderStatusUpdate(order.userId, orderId, newStatus, trackingInfo)
    
    // Update external tracking if shipped
    if (newStatus === OrderStatus.SHIPPED && trackingInfo) {
      await this.shippingProviderService.startTracking(trackingInfo.trackingNumber, trackingInfo.carrier)
    }
  }
  
  async getOrderTrackingDetails(orderId: string): Promise<OrderTrackingDetails> {
    const order = await this.orderRepository.findById(orderId)
    
    if (!order) {
      throw new OrderNotFoundError('Order not found')
    }
    
    // Get status history
    const statusHistory = await this.orderRepository.getStatusHistory(orderId)
    
    // Get external tracking info if available
    let externalTracking = null
    if (order.trackingNumber && order.carrier) {
      externalTracking = await this.shippingProviderService.getTrackingInfo(
        order.trackingNumber,
        order.carrier
      )
    }
    
    return new OrderTrackingDetails({
      order,
      statusHistory,
      externalTracking,
      estimatedDelivery: this.calculateEstimatedDelivery(order)
    })
  }
}
```

### 5. Payment Processing Service

#### 5.1 Payment Gateway Integration

**Class: PaymentGatewayService**
```typescript
class PaymentGatewayService {
  private stripeClient: StripeClient
  private paypalClient: PayPalClient
  private paymentRepository: PaymentRepository
  private fraudDetectionService: FraudDetectionService
  
  async processPayment(paymentRequest: PaymentRequest): Promise<PaymentResult> {
    // Fraud detection screening
    const fraudScore = await this.fraudDetectionService.assessRisk(paymentRequest)
    
    if (fraudScore > 0.8) {
      throw new FraudDetectionError('Transaction flagged as high risk')
    }
    
    // Create payment record
    const payment = new Payment({
      paymentId: generateUUID(),
      orderId: paymentRequest.orderId,
      amount: paymentRequest.amount,
      paymentMethod: paymentRequest.paymentMethod,
      status: PaymentStatus.PENDING,
      createdAt: new Date()
    })
    
    await this.paymentRepository.save(payment)
    
    try {
      let gatewayResult: GatewayPaymentResult
      
      // Route to appropriate payment gateway
      switch (paymentRequest.paymentMethod.type) {
        case PaymentMethodType.CREDIT_CARD:
          gatewayResult = await this.processCardPayment(paymentRequest)
          break
        case PaymentMethodType.PAYPAL:
          gatewayResult = await this.processPayPalPayment(paymentRequest)
          break
        default:
          throw new UnsupportedPaymentMethodError('Payment method not supported')
      }
      
      // Update payment record
      payment.status = gatewayResult.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED
      payment.transactionId = gatewayResult.transactionId
      payment.gatewayResponse = gatewayResult.rawResponse
      payment.processedAt = new Date()
      
      await this.paymentRepository.save(payment)
      
      return new PaymentResult({
        success: gatewayResult.success,
        paymentId: payment.paymentId,
        transactionId: gatewayResult.transactionId,
        errorMessage: gatewayResult.errorMessage
      })
      
    } catch (error) {
      // Update payment record with failure
      payment.status = PaymentStatus.FAILED
      payment.errorMessage = error.message
      payment.processedAt = new Date()
      
      await this.paymentRepository.save(payment)
      
      throw error
    }
  }
  
  private async processCardPayment(paymentRequest: PaymentRequest): Promise<GatewayPaymentResult> {
    const cardDetails = paymentRequest.paymentMethod.cardDetails
    
    // Tokenize card for PCI compliance
    const cardToken = await this.stripeClient.createToken({
      number: cardDetails.number,
      exp_month: cardDetails.expiryMonth,
      exp_year: cardDetails.expiryYear,
      cvc: cardDetails.cvv
    })
    
    // Process payment with token
    const charge = await this.stripeClient.charges.create({
      amount: Math.round(paymentRequest.amount * 100), // Convert to cents
      currency: 'usd',
      source: cardToken.id,
      description: `Order ${paymentRequest.orderId}`,
      metadata: {
        orderId: paymentRequest.orderId
      }
    })
    
    return new GatewayPaymentResult({
      success: charge.status === 'succeeded',
      transactionId: charge.id,
      rawResponse: charge
    })
  }
}
```

#### 5.2 Refund Processing Component

**Class: RefundService**
```typescript
class RefundService {
  private paymentRepository: PaymentRepository
  private refundRepository: RefundRepository
  private stripeClient: StripeClient
  private paypalClient: PayPalClient
  private notificationService: NotificationService
  
  async processRefund(refundRequest: RefundRequest): Promise<RefundResult> {
    // Find original payment
    const payment = await this.paymentRepository.findByOrderId(refundRequest.orderId)
    
    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      throw new InvalidRefundError('Original payment not found or not completed')
    }
    
    // Validate refund amount
    const existingRefunds = await this.refundRepository.findByOrderId(refundRequest.orderId)
    const totalRefunded = existingRefunds.reduce((sum, refund) => sum + refund.amount, 0)
    
    if (totalRefunded + refundRequest.amount > payment.amount) {
      throw new InvalidRefundError('Refund amount exceeds original payment')
    }
    
    // Create refund record
    const refund = new Refund({
      refundId: generateUUID(),
      orderId: refundRequest.orderId,
      paymentId: payment.paymentId,
      amount: refundRequest.amount,
      reason: refundRequest.reason,
      status: RefundStatus.PENDING,
      requestedAt: new Date()
    })
    
    await this.refundRepository.save(refund)
    
    try {
      let gatewayResult: GatewayRefundResult
      
      // Process refund through original gateway
      switch (payment.paymentMethod) {
        case PaymentMethodType.CREDIT_CARD:
          gatewayResult = await this.processStripeRefund(payment.transactionId, refundRequest.amount)
          break
        case PaymentMethodType.PAYPAL:
          gatewayResult = await this.processPayPalRefund(payment.transactionId, refundRequest.amount)
          break
        default:
          throw new UnsupportedRefundError('Refund not supported for this payment method')
      }
      
      // Update refund record
      refund.status = gatewayResult.success ? RefundStatus.COMPLETED : RefundStatus.FAILED
      refund.gatewayRefundId = gatewayResult.refundId
      refund.processedAt = new Date()
      
      await this.refundRepository.save(refund)
      
      // Send notification
      if (gatewayResult.success) {
        await this.notificationService.sendRefundConfirmation(
          refundRequest.userId,
          refundRequest.orderId,
          refundRequest.amount
        )
      }
      
      return new RefundResult({
        success: gatewayResult.success,
        refundId: refund.refundId,
        gatewayRefundId: gatewayResult.refundId
      })
      
    } catch (error) {
      refund.status = RefundStatus.FAILED
      refund.errorMessage = error.message
      refund.processedAt = new Date()
      
      await this.refundRepository.save(refund)
      
      throw error
    }
  }
}
```

## Data Flow Diagrams

### 1. User Registration Flow

```
[User] → [Registration Form] → [Validation] → [Password Hashing] → [Database] → [Email Service] → [Confirmation]
   ↓                              ↓               ↓                 ↓             ↓               ↓
 Input    Field Validation    Business Rules   Secure Storage   Email Queue   User Notification
```

### 2. Product Search Flow

```
[User Query] → [Cache Check] → [Elasticsearch] → [Result Processing] → [Cache Update] → [Response]
      ↓             ↓              ↓                    ↓                   ↓             ↓
   Keywords    Cache Miss     Search Index        Ranking & Filtering    Store Results  JSON Response
```

### 3. Order Processing Flow

```
[Cart] → [Validation] → [Inventory Reserve] → [Order Creation] → [Payment] → [Confirmation] → [Notifications]
   ↓         ↓               ↓                     ↓              ↓           ↓               ↓
Items    Product Check   Stock Locking        Database Save   Gateway API  Email/SMS    Seller Alert
```

## Sequence Diagrams

### 1. User Authentication Sequence

```
User → Frontend → AuthService → UserRepository → Database → AuditService → JWTService → Frontend → User
  |       |          |             |              |          |             |           |        |
  |-------|----------|-------------|--------------|----------|-------------|-----------|--------|
  | Login |          |             |              |          |             |           |        |
  |   Request        |             |              |          |             |           |        |
  |       |----------|-------------|--------------|----------|-------------|-----------|--------|
  |       |   Validate Credentials |              |          |             |           |        |
  |       |          |-------------|--------------|----------|-------------|-----------|--------|
  |       |          |      Find User by Email   |          |             |           |        |
  |       |          |             |--------------|----------|-------------|-----------|--------|
  |       |          |             |       Query Database    |             |           |        |
  |       |          |             |              |----------|-------------|-----------|--------|
  |       |          |             |              | User Data|             |           |        |
  |       |          |             |<-------------|----------|-------------|-----------|--------|
  |       |          |<------------|--------------|----------|-------------|-----------|--------|
  |       |          | Verify Password Hash       |          |             |           |        |
  |       |          |-------------|--------------|----------|-------------|-----------|--------|
  |       |          |             |              |   Log Login Event      |           |        |
  |       |          |             |              |          |-------------|-----------|--------|
  |       |          |             |              |          |      Generate JWT Token |        |
  |       |          |             |              |          |             |-----------|--------|
  |       |          |             |              |          |             |    JWT    |        |
  |       |          |             |              |          |<------------|-----------|--------|
  |       |<---------|-------------|--------------|----------|-------------|-----------|--------|
  |       |                    Success Response with JWT Token              |           |        |
  |<------|-------------|-------------|--------------|----------|-------------|-----------|--------|
  |                           Authenticated User Session                     |           |        |
```

### 2. Order Processing Sequence

```
User → Frontend → OrderService → InventoryService → PaymentService → NotificationService
  |       |          |              |                  |                |
  |-------|----------|--------------|------------------|----------------|
  | Place |          |              |                  |                |
  | Order |          |              |                  |                |
  |       |----------|--------------|------------------|----------------|
  |       |    Create Order Request |                  |                |
  |       |          |--------------|------------------|----------------|
  |       |          |   Reserve Inventory             |                |
  |       |          |              |------------------|----------------|
  |       |          |              |    Process Payment               |
  |       |          |              |                  |----------------|
  |       |          |              |                  | Send Confirmation
  |       |          |<-------------|------------------|----------------|
  |       |          |         Order Created Successfully              |
  |       |<---------|--------------|------------------|----------------|
  |       |              Order Confirmation                            |
  |<------|-------------|--------------|------------------|----------------|
  |                    Order Placed Successfully                       |
```

## Implementation Details

### 1. Security Implementation

**Password Hashing:**
```typescript
const SALT_ROUNDS = 12
const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS)
```

**JWT Token Generation:**
```typescript
const token = jwt.sign(
  { userId, email, role },
  process.env.JWT_SECRET,
  { expiresIn: '24h', issuer: 'shopping-platform' }
)
```

**Input Validation:**
```typescript
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
})
```

### 2. Database Optimization

**Connection Pooling:**
```typescript
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})
```

**Query Optimization:**
```sql
-- Optimized product search query
SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.review_id) as review_count
FROM products p
LEFT JOIN product_reviews r ON p.product_id = r.product_id
WHERE p.is_active = true
  AND (p.name ILIKE $1 OR p.description ILIKE $1)
  AND ($2::varchar IS NULL OR p.category = $2)
  AND ($3::decimal IS NULL OR p.price >= $3)
  AND ($4::decimal IS NULL OR p.price <= $4)
GROUP BY p.product_id
ORDER BY 
  CASE WHEN $5 = 'price_asc' THEN p.price END ASC,
  CASE WHEN $5 = 'price_desc' THEN p.price END DESC,
  CASE WHEN $5 = 'rating' THEN AVG(r.rating) END DESC NULLS LAST
LIMIT $6 OFFSET $7;
```

### 3. Caching Strategy

**Redis Cache Implementation:**
```typescript
class CacheService {
  private redisClient: Redis
  
  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redisClient.get(key)
    return cached ? JSON.parse(cached) : null
  }
  
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value))
  }
  
  async delete(key: string): Promise<void> {
    await this.redisClient.del(key)
  }
  
  async acquireLock(lockKey: string, ttlMs: number): Promise<boolean> {
    const result = await this.redisClient.set(lockKey, '1', 'PX', ttlMs, 'NX')
    return result === 'OK'
  }
}
```

### 4. Error Handling

**Circuit Breaker Implementation:**
```typescript
class CircuitBreaker {
  private failureCount = 0
  private lastFailureTime = 0
  private state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN'
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is open')
      }
    }
    
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0
    this.state = 'CLOSED'
  }
  
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }
}
```

### 5. Performance Monitoring

**APM Integration:**
```typescript
import * as newrelic from 'newrelic'

class PerformanceMonitor {
  static trackTransaction(name: string, category: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value
      
      descriptor.value = async function(...args: any[]) {
        const startTime = Date.now()
        
        try {
          const result = await originalMethod.apply(this, args)
          
          // Record successful transaction
          newrelic.recordMetric(`Custom/${category}/${name}`, Date.now() - startTime)
          
          return result
        } catch (error) {
          // Record error
          newrelic.noticeError(error)
          throw error
        }
      }
    }
  }
}

// Usage
class OrderService {
  @PerformanceMonitor.trackTransaction('CreateOrder', 'Orders')
  async createOrder(orderData: CreateOrderRequest): Promise<Order> {
    // Implementation
  }
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('UserRegistrationService', () => {
  let userRegistrationService: UserRegistrationService
  let mockUserRepository: jest.Mocked<UserRepository>
  let mockEmailService: jest.Mocked<EmailService>
  
  beforeEach(() => {
    mockUserRepository = createMockUserRepository()
    mockEmailService = createMockEmailService()
    userRegistrationService = new UserRegistrationService(
      mockUserRepository,
      mockEmailService
    )
  })
  
  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      }
      
      mockUserRepository.findByEmail.mockResolvedValue(null)
      mockUserRepository.save.mockResolvedValue(undefined)
      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined)
      
      // Act
      const result = await userRegistrationService.registerUser(userData)
      
      // Assert
      expect(result.success).toBe(true)
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName
        })
      )
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        userData.email,
        expect.any(String)
      )
    })
    
    it('should throw error for duplicate email', async () => {
      // Arrange
      const userData = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      }
      
      mockUserRepository.findByEmail.mockResolvedValue({
        userId: 'existing-id',
        email: userData.email
      } as User)
      
      // Act & Assert
      await expect(userRegistrationService.registerUser(userData))
        .rejects.toThrow(DuplicateEmailError)
    })
  })
})
```

### 2. Integration Tests

```typescript
describe('Order Processing Integration', () => {
  let app: Application
  let testDatabase: TestDatabase
  
  beforeAll(async () => {
    testDatabase = await setupTestDatabase()
    app = await createTestApp(testDatabase)
  })
  
  afterAll(async () => {
    await testDatabase.cleanup()
  })
  
  it('should process complete order flow', async () => {
    // Setup test data
    const user = await testDatabase.createUser({
      email: 'customer@test.com',
      role: UserRole.CUSTOMER
    })
    
    const product = await testDatabase.createProduct({
      name: 'Test Product',
      price: 99.99,
      inventory: 10
    })
    
    // Add to cart
    const cartResponse = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        productId: product.productId,
        quantity: 2
      })
      .expect(200)
    
    // Create order
    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345'
        },
        paymentMethod: {
          type: 'CREDIT_CARD',
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123'
        }
      })
      .expect(201)
    
    // Verify order was created
    const order = orderResponse.body
    expect(order.orderId).toBeDefined()
    expect(order.totalAmount).toBe(199.98)
    expect(order.status).toBe('PROCESSING')
    
    // Verify inventory was reserved
    const updatedProduct = await testDatabase.findProduct(product.productId)
    expect(updatedProduct.inventory).toBe(8)
  })
})
```

## Deployment Configuration

### 1. Docker Configuration

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

USER node

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  user-service:
    build: ./services/user-service
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/shopping_db
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    networks:
      - shopping-network

  product-service:
    build: ./services/product-service
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/shopping_db
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - elasticsearch
      - redis
    networks:
      - shopping-network

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=shopping_db
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - shopping-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - shopping-network

  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - shopping-network

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:

networks:
  shopping-network:
    driver: bridge
```

### 2. Kubernetes Configuration

**deployment.yaml:**
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
        image: shopping-platform/user-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
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
```

## Compliance and Security Validation

### 1. PCI DSS Compliance

- **Requirement 1**: Firewall configuration implemented via Kubernetes network policies
- **Requirement 2**: Default passwords changed, unnecessary services disabled
- **Requirement 3**: Cardholder data encrypted using AES-256, tokenization implemented
- **Requirement 4**: Encryption in transit using TLS 1.3
- **Requirement 6**: Secure development practices, regular security testing
- **Requirement 7**: Access control implemented via RBAC
- **Requirement 8**: Multi-factor authentication for administrative access
- **Requirement 9**: Physical access controls for production systems
- **Requirement 10**: Comprehensive audit logging implemented
- **Requirement 11**: Regular security testing and vulnerability scanning
- **Requirement 12**: Information security policy maintained

### 2. GDPR Compliance

- **Data Minimization**: Only necessary data collected and stored
- **Consent Management**: Explicit consent mechanisms implemented
- **Right to Access**: User data export functionality provided
- **Right to Rectification**: Profile update capabilities implemented
- **Right to Erasure**: Account deletion with data purging
- **Data Portability**: Export user data in machine-readable format
- **Privacy by Design**: Privacy controls built into system architecture
- **Data Protection Officer**: Designated DPO for compliance oversight

### 3. SOC 2 Type II Controls

- **Security**: Multi-layered security controls implemented
- **Availability**: 99.9% uptime SLA with redundancy and failover
- **Processing Integrity**: Data validation and error handling throughout
- **Confidentiality**: Encryption and access controls for sensitive data
- **Privacy**: GDPR-compliant privacy controls and consent management

## Performance Benchmarks

### 1. Response Time Targets

- **User Registration**: < 2 seconds
- **User Authentication**: < 1 second
- **Product Search**: < 2 seconds
- **Add to Cart**: < 1 second
- **Checkout Process**: < 5 seconds
- **Order Status Check**: < 1 second

### 2. Throughput Targets

- **Concurrent Users**: 100,000 simultaneous users
- **Orders per Second**: 1,000 orders/second peak
- **Search Queries**: 10,000 queries/second
- **API Requests**: 50,000 requests/second

### 3. Scalability Metrics

- **Horizontal Scaling**: Auto-scaling based on CPU/memory utilization
- **Database Connections**: Connection pooling with max 20 connections per service
- **Cache Hit Rate**: > 80% for frequently accessed data
- **CDN Utilization**: > 90% of static assets served via CDN

## Monitoring and Alerting

### 1. Application Performance Monitoring

```typescript
// Custom metrics collection
class MetricsCollector {
  private static instance: MetricsCollector
  private metricsRegistry: Registry
  
  constructor() {
    this.metricsRegistry = new Registry()
    this.setupDefaultMetrics()
  }
  
  private setupDefaultMetrics(): void {
    // Response time histogram
    const responseTimeHistogram = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5]
    })
    
    // Request counter
    const requestCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    })
    
    this.metricsRegistry.registerMetric(responseTimeHistogram)
    this.metricsRegistry.registerMetric(requestCounter)
  }
}
```

### 2. Health Check Endpoints

```typescript
class HealthCheckController {
  @Get('/health')
  async healthCheck(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkElasticsearch(),
      this.checkExternalServices()
    ])
    
    const overallHealth = checks.every(check => check.status === 'fulfilled')
    
    return {
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: checks[0].status === 'fulfilled' ? 'up' : 'down',
        redis: checks[1].status === 'fulfilled' ? 'up' : 'down',
        elasticsearch: checks[2].status === 'fulfilled' ? 'up' : 'down',
        externalServices: checks[3].status === 'fulfilled' ? 'up' : 'down'
      }
    }
  }
}
```

## Conclusion

This Low-Level Design document provides comprehensive technical specifications for implementing the Online Shopping Platform. The design emphasizes:

1. **Scalability**: Microservices architecture with horizontal scaling capabilities
2. **Security**: Multi-layered security controls meeting PCI DSS and GDPR requirements
3. **Performance**: Optimized data access patterns and caching strategies
4. **Reliability**: Circuit breaker patterns and comprehensive error handling
5. **Maintainability**: Clean code architecture with comprehensive testing
6. **Compliance**: Built-in audit trails and regulatory compliance features

The implementation follows enterprise-grade best practices and provides a solid foundation for building a production-ready e-commerce platform that can handle high traffic volumes while maintaining security and compliance standards.