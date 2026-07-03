# Online Shopping Platform - Low-Level Design Document (Dav0703)

## Executive Summary

This Low-Level Design (LLD) document provides detailed technical specifications, component designs, data flows, sequence diagrams, and implementation details for the Online Shopping Platform based on the High-Level Design (HLD). This document serves as the blueprint for development teams to implement the enterprise-grade e-commerce solution with compliance to SOC2, ISO27001, and PCI-DSS standards.

## Table of Contents

1. [Component Specifications](#component-specifications)
2. [Database Design](#database-design)
3. [API Specifications](#api-specifications)
4. [Sequence Diagrams](#sequence-diagrams)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Security Implementation](#security-implementation)
7. [Error Handling](#error-handling)
8. [Performance Optimization](#performance-optimization)
9. [Deployment Specifications](#deployment-specifications)
10. [Testing Strategy](#testing-strategy)

## Component Specifications

### 1. User Service Component

#### Technology Stack
- **Runtime**: Node.js 18.x LTS
- **Framework**: Express.js 4.18+
- **Language**: TypeScript 5.0+
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7.0+
- **Authentication**: JWT + bcrypt

#### Service Architecture
```typescript
// User Service Structure
src/
├── controllers/
│   ├── AuthController.ts
│   ├── UserController.ts
│   └── ProfileController.ts
├── services/
│   ├── AuthService.ts
│   ├── UserService.ts
│   └── NotificationService.ts
├── models/
│   ├── User.ts
│   ├── Role.ts
│   └── Session.ts
├── middleware/
│   ├── AuthMiddleware.ts
│   ├── ValidationMiddleware.ts
│   └── RateLimitMiddleware.ts
├── utils/
│   ├── PasswordUtils.ts
│   ├── TokenUtils.ts
│   └── EncryptionUtils.ts
└── routes/
    ├── auth.ts
    ├── users.ts
    └── profile.ts
```

#### Core Classes and Interfaces

```typescript
// User Model
interface IUser {
  userId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  loginAttempts: number;
  lockoutUntil?: Date;
}

enum UserRole {
  CONSUMER = 'consumer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

// Authentication Service
class AuthService {
  async register(userData: RegisterDTO): Promise<UserResponseDTO> {
    // 1. Validate input data
    // 2. Check email uniqueness
    // 3. Hash password with bcrypt (12 rounds)
    // 4. Generate email verification token
    // 5. Store user in database
    // 6. Send verification email
    // 7. Return sanitized user data
  }

  async login(credentials: LoginDTO): Promise<AuthResponseDTO> {
    // 1. Validate credentials
    // 2. Check account lockout
    // 3. Verify password
    // 4. Check 2FA if enabled
    // 5. Generate JWT tokens
    // 6. Update last login
    // 7. Return tokens and user data
  }

  async refreshToken(refreshToken: string): Promise<TokenResponseDTO> {
    // 1. Validate refresh token
    // 2. Check token blacklist
    // 3. Generate new access token
    // 4. Rotate refresh token
    // 5. Return new tokens
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    // 1. Add token to blacklist
    // 2. Clear session data
    // 3. Log audit event
  }
}

// User Controller
class UserController {
  @Post('/register')
  @ValidateBody(RegisterSchema)
  @RateLimit(5, '15m') // 5 attempts per 15 minutes
  async register(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful. Please verify your email.'
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  @Post('/login')
  @ValidateBody(LoginSchema)
  @RateLimit(10, '15m') // 10 attempts per 15 minutes
  async login(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.authService.login(req.body);
      
      // Set secure HTTP-only cookies
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000 // 15 minutes
      });
      
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      res.json({
        success: true,
        data: result.user,
        message: 'Login successful'
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }
}
```

### 2. Product Service Component

#### Technology Stack
- **Runtime**: Java 17 LTS
- **Framework**: Spring Boot 3.1+
- **Database**: PostgreSQL 15+ with Elasticsearch 8.0+
- **Cache**: Redis 7.0+
- **Image Storage**: AWS S3

#### Service Architecture
```java
// Product Service Structure
src/main/java/com/ecommerce/product/
├── controller/
│   ├── ProductController.java
│   ├── CategoryController.java
│   └── SearchController.java
├── service/
│   ├── ProductService.java
│   ├── CategoryService.java
│   ├── SearchService.java
│   └── InventoryService.java
├── repository/
│   ├── ProductRepository.java
│   ├── CategoryRepository.java
│   └── InventoryRepository.java
├── model/
│   ├── Product.java
│   ├── Category.java
│   ├── ProductImage.java
│   └── Inventory.java
├── dto/
│   ├── ProductDTO.java
│   ├── ProductCreateDTO.java
│   └── SearchRequestDTO.java
└── config/
    ├── ElasticsearchConfig.java
    ├── RedisConfig.java
    └── S3Config.java
```

#### Core Classes and Implementation

```java
// Product Entity
@Entity
@Table(name = "products")
@EntityListeners(AuditingEntityListener.class)
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID productId;
    
    @Column(nullable = false, length = 255)
    @NotBlank(message = "Product name is required")
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    @DecimalMin(value = "0.01", message = "Price must be greater than 0")
    private BigDecimal price;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;
    
    @Column(nullable = false)
    private UUID sellerId;
    
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<ProductImage> images = new ArrayList<>();
    
    @OneToOne(mappedBy = "product", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Inventory inventory;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

// Product Service Implementation
@Service
@Transactional
public class ProductServiceImpl implements ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private SearchService searchService;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Autowired
    private S3Service s3Service;
    
    @Override
    @Cacheable(value = "products", key = "#productId")
    public ProductDTO getProduct(UUID productId) {
        Product product = productRepository.findByIdAndIsActiveTrue(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));
        
        return ProductMapper.toDTO(product);
    }
    
    @Override
    @CacheEvict(value = "products", key = "#result.productId")
    public ProductDTO createProduct(ProductCreateDTO createDTO, UUID sellerId) {
        // 1. Validate seller permissions
        validateSellerPermissions(sellerId);
        
        // 2. Validate product data
        validateProductData(createDTO);
        
        // 3. Create product entity
        Product product = new Product();
        product.setName(createDTO.getName());
        product.setDescription(createDTO.getDescription());
        product.setPrice(createDTO.getPrice());
        product.setSellerId(sellerId);
        product.setCategory(getCategoryById(createDTO.getCategoryId()));
        
        // 4. Handle image uploads
        if (createDTO.getImages() != null && !createDTO.getImages().isEmpty()) {
            List<ProductImage> images = uploadProductImages(createDTO.getImages(), product);
            product.setImages(images);
        }
        
        // 5. Create inventory record
        Inventory inventory = new Inventory();
        inventory.setProduct(product);
        inventory.setQuantity(createDTO.getInitialStock());
        inventory.setReorderLevel(createDTO.getReorderLevel());
        product.setInventory(inventory);
        
        // 6. Save to database
        Product savedProduct = productRepository.save(product);
        
        // 7. Index in Elasticsearch
        searchService.indexProduct(savedProduct);
        
        // 8. Publish product created event
        publishProductEvent(ProductEvent.CREATED, savedProduct);
        
        return ProductMapper.toDTO(savedProduct);
    }
    
    @Override
    public Page<ProductDTO> searchProducts(SearchRequestDTO searchRequest, Pageable pageable) {
        // 1. Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        // Text search
        if (StringUtils.hasText(searchRequest.getQuery())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(
                searchRequest.getQuery(),
                "name^2", "description", "category.name"
            ).type(MultiMatchQueryBuilder.Type.BEST_FIELDS));
        }
        
        // Category filter
        if (searchRequest.getCategoryId() != null) {
            queryBuilder.filter(QueryBuilders.termQuery("categoryId", searchRequest.getCategoryId()));
        }
        
        // Price range filter
        if (searchRequest.getMinPrice() != null || searchRequest.getMaxPrice() != null) {
            RangeQueryBuilder priceRange = QueryBuilders.rangeQuery("price");
            if (searchRequest.getMinPrice() != null) {
                priceRange.gte(searchRequest.getMinPrice());
            }
            if (searchRequest.getMaxPrice() != null) {
                priceRange.lte(searchRequest.getMaxPrice());
            }
            queryBuilder.filter(priceRange);
        }
        
        // Only active products
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        // 2. Execute search
        SearchResponse<ProductDocument> response = searchService.search(queryBuilder, pageable);
        
        // 3. Convert to DTOs
        List<ProductDTO> products = response.hits().hits().stream()
            .map(hit -> convertToDTO(hit.source()))
            .collect(Collectors.toList());
        
        return new PageImpl<>(products, pageable, response.hits().total().value());
    }
    
    private void validateSellerPermissions(UUID sellerId) {
        // Call User Service to validate seller role
        UserDTO seller = userServiceClient.getUser(sellerId);
        if (!UserRole.SELLER.equals(seller.getRole()) && !UserRole.ADMIN.equals(seller.getRole())) {
            throw new UnauthorizedException("User does not have seller permissions");
        }
    }
    
    private List<ProductImage> uploadProductImages(List<MultipartFile> imageFiles, Product product) {
        List<ProductImage> images = new ArrayList<>();
        
        for (int i = 0; i < imageFiles.size() && i < 10; i++) { // Max 10 images
            MultipartFile file = imageFiles.get(i);
            
            // Validate image
            validateImageFile(file);
            
            // Upload to S3
            String imageUrl = s3Service.uploadImage(file, "products/" + product.getProductId());
            
            // Create image record
            ProductImage image = new ProductImage();
            image.setProduct(product);
            image.setImageUrl(imageUrl);
            image.setDisplayOrder(i);
            image.setIsPrimary(i == 0);
            
            images.add(image);
        }
        
        return images;
    }
}
```

### 3. Order Service Component

#### Technology Stack
- **Runtime**: Python 3.11+
- **Framework**: FastAPI 0.100+
- **Database**: PostgreSQL 15+ with asyncpg
- **Cache**: Redis 7.0+
- **Message Queue**: Apache Kafka

#### Service Architecture
```python
# Order Service Structure
src/
├── api/
│   ├── routes/
│   │   ├── cart.py
│   │   ├── orders.py
│   │   └── checkout.py
│   └── dependencies/
│       ├── auth.py
│       └── database.py
├── core/
│   ├── config.py
│   ├── security.py
│   └── events.py
├── models/
│   ├── cart.py
│   ├── order.py
│   └── order_item.py
├── services/
│   ├── cart_service.py
│   ├── order_service.py
│   └── checkout_service.py
├── schemas/
│   ├── cart_schemas.py
│   ├── order_schemas.py
│   └── checkout_schemas.py
└── utils/
    ├── database.py
    ├── redis_client.py
    └── kafka_producer.py
```

#### Core Classes and Implementation

```python
# Order Models
from sqlalchemy import Column, String, DateTime, Decimal, Integer, Boolean, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from enum import Enum as PyEnum
import uuid
from datetime import datetime

class OrderStatus(PyEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"

class Order(Base):
    __tablename__ = "orders"
    
    order_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    total_amount = Column(Decimal(10, 2), nullable=False)
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    shipping_address = Column(String, nullable=False)
    billing_address = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)

class OrderItem(Base):
    __tablename__ = "order_items"
    
    item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Decimal(10, 2), nullable=False)
    total_price = Column(Decimal(10, 2), nullable=False)
    
    # Relationships
    order = relationship("Order", back_populates="items")

# Cart Service Implementation
class CartService:
    def __init__(self, redis_client: Redis, product_service_client: ProductServiceClient):
        self.redis = redis_client
        self.product_service = product_service_client
    
    async def add_to_cart(self, user_id: UUID, product_id: UUID, quantity: int) -> CartResponse:
        """
        Add item to user's shopping cart
        """
        # 1. Validate product exists and is available
        product = await self.product_service.get_product(product_id)
        if not product or not product.is_active:
            raise ProductNotFoundException(f"Product {product_id} not found or inactive")
        
        # 2. Check inventory availability
        if product.inventory.quantity < quantity:
            raise InsufficientInventoryException(
                f"Only {product.inventory.quantity} items available"
            )
        
        # 3. Get current cart from Redis
        cart_key = f"cart:{user_id}"
        cart_data = await self.redis.hgetall(cart_key)
        
        # 4. Update cart item
        item_key = str(product_id)
        current_quantity = int(cart_data.get(item_key, 0))
        new_quantity = current_quantity + quantity
        
        # 5. Validate total quantity doesn't exceed inventory
        if new_quantity > product.inventory.quantity:
            raise InsufficientInventoryException(
                f"Total quantity {new_quantity} exceeds available inventory"
            )
        
        # 6. Update cart in Redis
        await self.redis.hset(cart_key, item_key, new_quantity)
        await self.redis.expire(cart_key, 86400 * 7)  # 7 days expiry
        
        # 7. Return updated cart
        return await self.get_cart(user_id)
    
    async def get_cart(self, user_id: UUID) -> CartResponse:
        """
        Get user's shopping cart with product details
        """
        cart_key = f"cart:{user_id}"
        cart_data = await self.redis.hgetall(cart_key)
        
        if not cart_data:
            return CartResponse(user_id=user_id, items=[], total_amount=Decimal('0.00'))
        
        # Get product details for all items
        product_ids = [UUID(pid) for pid in cart_data.keys()]
        products = await self.product_service.get_products_batch(product_ids)
        
        cart_items = []
        total_amount = Decimal('0.00')
        
        for product_id_str, quantity_str in cart_data.items():
            product_id = UUID(product_id_str)
            quantity = int(quantity_str)
            
            product = products.get(product_id)
            if product and product.is_active:
                item_total = product.price * quantity
                cart_items.append(CartItem(
                    product_id=product_id,
                    product_name=product.name,
                    unit_price=product.price,
                    quantity=quantity,
                    total_price=item_total
                ))
                total_amount += item_total
        
        return CartResponse(
            user_id=user_id,
            items=cart_items,
            total_amount=total_amount
        )

# Order Service Implementation
class OrderService:
    def __init__(
        self,
        db_session: AsyncSession,
        cart_service: CartService,
        payment_service_client: PaymentServiceClient,
        kafka_producer: KafkaProducer
    ):
        self.db = db_session
        self.cart_service = cart_service
        self.payment_service = payment_service_client
        self.kafka_producer = kafka_producer
    
    async def create_order(self, user_id: UUID, checkout_request: CheckoutRequest) -> OrderResponse:
        """
        Create order from cart and process payment
        """
        async with self.db.begin():
            # 1. Get and validate cart
            cart = await self.cart_service.get_cart(user_id)
            if not cart.items:
                raise EmptyCartException("Cannot create order from empty cart")
            
            # 2. Validate inventory for all items
            for item in cart.items:
                product = await self.product_service.get_product(item.product_id)
                if product.inventory.quantity < item.quantity:
                    raise InsufficientInventoryException(
                        f"Insufficient inventory for product {product.name}"
                    )
            
            # 3. Create order entity
            order = Order(
                user_id=user_id,
                total_amount=cart.total_amount,
                shipping_address=checkout_request.shipping_address,
                billing_address=checkout_request.billing_address,
                status=OrderStatus.PENDING
            )
            self.db.add(order)
            await self.db.flush()  # Get order_id
            
            # 4. Create order items
            for cart_item in cart.items:
                order_item = OrderItem(
                    order_id=order.order_id,
                    product_id=cart_item.product_id,
                    quantity=cart_item.quantity,
                    unit_price=cart_item.unit_price,
                    total_price=cart_item.total_price
                )
                self.db.add(order_item)
            
            # 5. Reserve inventory
            for item in cart.items:
                await self.product_service.reserve_inventory(
                    item.product_id, 
                    item.quantity
                )
            
            # 6. Process payment
            try:
                payment_result = await self.payment_service.process_payment(
                    PaymentRequest(
                        order_id=order.order_id,
                        amount=order.total_amount,
                        payment_method=checkout_request.payment_method,
                        billing_address=checkout_request.billing_address
                    )
                )
                
                if payment_result.status == PaymentStatus.SUCCESS:
                    order.status = OrderStatus.CONFIRMED
                    
                    # Clear cart
                    await self.cart_service.clear_cart(user_id)
                    
                    # Publish order confirmed event
                    await self.kafka_producer.send(
                        'order-events',
                        {
                            'event_type': 'ORDER_CONFIRMED',
                            'order_id': str(order.order_id),
                            'user_id': str(user_id),
                            'total_amount': float(order.total_amount),
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    )
                    
                else:
                    # Release reserved inventory
                    for item in cart.items:
                        await self.product_service.release_inventory(
                            item.product_id, 
                            item.quantity
                        )
                    raise PaymentProcessingException("Payment processing failed")
                    
            except Exception as e:
                # Release reserved inventory on any error
                for item in cart.items:
                    await self.product_service.release_inventory(
                        item.product_id, 
                        item.quantity
                    )
                raise e
            
            await self.db.commit()
            
            return OrderResponse.from_orm(order)
    
    async def get_order(self, order_id: UUID, user_id: UUID) -> OrderResponse:
        """
        Get order details with authorization check
        """
        order = await self.db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.order_id == order_id)
        )
        order = order.scalar_one_or_none()
        
        if not order:
            raise OrderNotFoundException(f"Order {order_id} not found")
        
        # Authorization check
        if order.user_id != user_id:
            # Check if user is admin
            user = await self.user_service.get_user(user_id)
            if user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
                raise UnauthorizedException("Access denied to this order")
        
        return OrderResponse.from_orm(order)
```

### 4. Payment Service Component

#### Technology Stack
- **Runtime**: Java 17 LTS
- **Framework**: Spring Boot 3.1+ with Spring Security
- **Database**: PostgreSQL 15+ (encrypted)
- **Message Queue**: Apache Kafka
- **Payment Gateways**: Stripe, PayPal

#### Core Implementation

```java
// Payment Service Implementation
@Service
@Transactional
public class PaymentServiceImpl implements PaymentService {
    
    @Autowired
    private PaymentRepository paymentRepository;
    
    @Autowired
    private StripePaymentGateway stripeGateway;
    
    @Autowired
    private PayPalPaymentGateway paypalGateway;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Override
    public PaymentResponse processPayment(PaymentRequest request) {
        // 1. Validate payment request
        validatePaymentRequest(request);
        
        // 2. Run fraud detection
        FraudCheckResult fraudCheck = fraudDetectionService.checkTransaction(request);
        if (fraudCheck.isHighRisk()) {
            throw new FraudDetectedException("Transaction flagged as high risk");
        }
        
        // 3. Create payment record
        Payment payment = new Payment();
        payment.setOrderId(request.getOrderId());
        payment.setAmount(request.getAmount());
        payment.setMethod(request.getPaymentMethod());
        payment.setStatus(PaymentStatus.PROCESSING);
        payment.setCurrency("USD");
        
        payment = paymentRepository.save(payment);
        
        try {
            // 4. Process with appropriate gateway
            PaymentGatewayResponse gatewayResponse = processWithGateway(request);
            
            // 5. Update payment status
            if (gatewayResponse.isSuccess()) {
                payment.setStatus(PaymentStatus.SUCCESS);
                payment.setTransactionId(gatewayResponse.getTransactionId());
                payment.setGatewayResponse(gatewayResponse.getRawResponse());
                
                // Publish payment success event
                publishPaymentEvent(PaymentEventType.PAYMENT_SUCCESS, payment);
                
            } else {
                payment.setStatus(PaymentStatus.FAILED);
                payment.setFailureReason(gatewayResponse.getErrorMessage());
                
                // Publish payment failure event
                publishPaymentEvent(PaymentEventType.PAYMENT_FAILED, payment);
            }
            
        } catch (Exception e) {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason(e.getMessage());
            
            // Publish payment error event
            publishPaymentEvent(PaymentEventType.PAYMENT_ERROR, payment);
            
            throw new PaymentProcessingException("Payment processing failed", e);
        } finally {
            payment.setProcessedAt(LocalDateTime.now());
            paymentRepository.save(payment);
        }
        
        return PaymentResponse.builder()
            .paymentId(payment.getPaymentId())
            .status(payment.getStatus())
            .transactionId(payment.getTransactionId())
            .amount(payment.getAmount())
            .build();
    }
    
    private PaymentGatewayResponse processWithGateway(PaymentRequest request) {
        switch (request.getPaymentMethod()) {
            case CREDIT_CARD:
            case DEBIT_CARD:
                return stripeGateway.processPayment(request);
            case PAYPAL:
                return paypalGateway.processPayment(request);
            default:
                throw new UnsupportedPaymentMethodException(
                    "Payment method not supported: " + request.getPaymentMethod()
                );
        }
    }
    
    private void publishPaymentEvent(PaymentEventType eventType, Payment payment) {
        PaymentEvent event = PaymentEvent.builder()
            .eventType(eventType)
            .paymentId(payment.getPaymentId())
            .orderId(payment.getOrderId())
            .amount(payment.getAmount())
            .status(payment.getStatus())
            .timestamp(LocalDateTime.now())
            .build();
        
        kafkaTemplate.send("payment-events", event);
    }
}

// Fraud Detection Service
@Service
public class FraudDetectionService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public FraudCheckResult checkTransaction(PaymentRequest request) {
        FraudCheckResult result = new FraudCheckResult();
        
        // 1. Check velocity (number of transactions in time window)
        String velocityKey = "fraud:velocity:" + request.getUserId();
        Long transactionCount = redisTemplate.opsForValue().increment(velocityKey);
        
        if (transactionCount == 1) {
            redisTemplate.expire(velocityKey, Duration.ofMinutes(15));
        }
        
        if (transactionCount > 5) { // Max 5 transactions per 15 minutes
            result.addFlag(FraudFlag.HIGH_VELOCITY);
        }
        
        // 2. Check amount thresholds
        if (request.getAmount().compareTo(new BigDecimal("10000")) > 0) {
            result.addFlag(FraudFlag.HIGH_AMOUNT);
        }
        
        // 3. Check geographic location (if available)
        if (request.getBillingAddress() != null) {
            String country = extractCountry(request.getBillingAddress());
            if (isHighRiskCountry(country)) {
                result.addFlag(FraudFlag.HIGH_RISK_LOCATION);
            }
        }
        
        // 4. Check device fingerprinting (if available)
        if (request.getDeviceFingerprint() != null) {
            if (isKnownFraudulentDevice(request.getDeviceFingerprint())) {
                result.addFlag(FraudFlag.FRAUDULENT_DEVICE);
            }
        }
        
        return result;
    }
}
```

## Database Design

### Entity Relationship Diagram

```sql
-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'consumer',
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    lockout_until TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT chk_role CHECK (role IN ('consumer', 'seller', 'admin', 'super_admin')),
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Categories Table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products Table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    category_id UUID REFERENCES categories(category_id),
    seller_id UUID NOT NULL REFERENCES users(user_id),
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT chk_price_positive CHECK (price > 0)
);

-- Product Images Table
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventory Table
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    reorder_level INTEGER DEFAULT 0,
    last_restocked TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT chk_reserved_not_exceed_quantity CHECK (reserved_quantity <= quantity)
);

-- Orders Table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    order_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT chk_order_status CHECK (status IN (
        'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
    ))
);

-- Order Items Table
CREATE TABLE order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments Table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    method VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    transaction_id VARCHAR(255),
    gateway_response JSONB,
    failure_reason TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT chk_payment_method CHECK (method IN (
        'credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay'
    )),
    CONSTRAINT chk_payment_status CHECK (status IN (
        'pending', 'processing', 'success', 'failed', 'cancelled', 'refunded'
    ))
);

-- Reviews Table
CREATE TABLE reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    order_id UUID REFERENCES orders(order_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    is_approved BOOLEAN DEFAULT false,
    is_verified_purchase BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, product_id, order_id)
);

-- Notifications Table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT chk_notification_type CHECK (type IN (
        'order_confirmation', 'order_shipped', 'order_delivered', 
        'payment_success', 'payment_failed', 'product_review',
        'inventory_low', 'account_security'
    ))
);

-- Audit Log Table
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Database Indexes

```sql
-- Performance Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created ON products(created_at);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_approved ON reviews(is_approved);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Composite Indexes for Complex Queries
CREATE INDEX idx_products_category_active_price ON products(category_id, is_active, price);
CREATE INDEX idx_orders_user_status_created ON orders(user_id, status, created_at);
```

## API Specifications

### REST API Endpoints

#### User Service APIs

```yaml
# User Authentication APIs
POST /api/v1/auth/register:
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
              example: "john.doe@example.com"
            password:
              type: string
              minLength: 8
              pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
            firstName:
              type: string
              minLength: 1
              maxLength: 100
            lastName:
              type: string
              minLength: 1
              maxLength: 100
            phone:
              type: string
              pattern: "^\+?[1-9]\d{1,14}$"
  responses:
    201:
      description: User registered successfully
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: true
              data:
                $ref: '#/components/schemas/UserResponse'
              message:
                type: string
                example: "Registration successful. Please verify your email."
    400:
      description: Validation error
    409:
      description: Email already exists

POST /api/v1/auth/login:
  summary: User login
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
            totpCode:
              type: string
              description: "Required if 2FA is enabled"
  responses:
    200:
      description: Login successful
      headers:
        Set-Cookie:
          schema:
            type: string
            example: "accessToken=jwt_token; HttpOnly; Secure; SameSite=Strict"
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                $ref: '#/components/schemas/UserResponse'
              message:
                type: string
    401:
      description: Invalid credentials
    423:
      description: Account locked

POST /api/v1/auth/refresh:
  summary: Refresh access token
  security:
    - cookieAuth: []
  responses:
    200:
      description: Token refreshed
    401:
      description: Invalid refresh token

POST /api/v1/auth/logout:
  summary: User logout
  security:
    - bearerAuth: []
  responses:
    200:
      description: Logged out successfully
```

#### Product Service APIs

```yaml
# Product Management APIs
GET /api/v1/products:
  summary: Search and list products
  parameters:
    - name: q
      in: query
      description: Search query
      schema:
        type: string
    - name: category
      in: query
      description: Category filter
      schema:
        type: string
        format: uuid
    - name: minPrice
      in: query
      schema:
        type: number
        minimum: 0
    - name: maxPrice
      in: query
      schema:
        type: number
        minimum: 0
    - name: sortBy
      in: query
      schema:
        type: string
        enum: [price_asc, price_desc, name_asc, name_desc, created_desc]
        default: created_desc
    - name: page
      in: query
      schema:
        type: integer
        minimum: 0
        default: 0
    - name: size
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
  responses:
    200:
      description: Products retrieved successfully
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                type: object
                properties:
                  content:
                    type: array
                    items:
                      $ref: '#/components/schemas/ProductResponse'
                  totalElements:
                    type: integer
                  totalPages:
                    type: integer
                  size:
                    type: integer
                  number:
                    type: integer

GET /api/v1/products/{productId}:
  summary: Get product details
  parameters:
    - name: productId
      in: path
      required: true
      schema:
        type: string
        format: uuid
  responses:
    200:
      description: Product details
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                $ref: '#/components/schemas/ProductDetailResponse'
    404:
      description: Product not found

POST /api/v1/products:
  summary: Create new product (Seller/Admin only)
  security:
    - bearerAuth: []
  requestBody:
    required: true
    content:
      multipart/form-data:
        schema:
          type: object
          required: [name, description, price, categoryId]
          properties:
            name:
              type: string
              maxLength: 255
            description:
              type: string
            price:
              type: number
              minimum: 0.01
            categoryId:
              type: string
              format: uuid
            sku:
              type: string
              maxLength: 100
            initialStock:
              type: integer
              minimum: 0
            reorderLevel:
              type: integer
              minimum: 0
            images:
              type: array
              items:
                type: string
                format: binary
              maxItems: 10
  responses:
    201:
      description: Product created successfully
    400:
      description: Validation error
    403:
      description: Insufficient permissions
```

#### Order Service APIs

```yaml
# Shopping Cart APIs
GET /api/v1/cart:
  summary: Get user's shopping cart
  security:
    - bearerAuth: []
  responses:
    200:
      description: Cart retrieved successfully
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                $ref: '#/components/schemas/CartResponse'

POST /api/v1/cart/items:
  summary: Add item to cart
  security:
    - bearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [productId, quantity]
          properties:
            productId:
              type: string
              format: uuid
            quantity:
              type: integer
              minimum: 1
              maximum: 100
  responses:
    200:
      description: Item added to cart
    400:
      description: Invalid request
    404:
      description: Product not found
    409:
      description: Insufficient inventory

# Order Management APIs
POST /api/v1/orders:
  summary: Create order from cart
  security:
    - bearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [shippingAddress, billingAddress, paymentMethod]
          properties:
            shippingAddress:
              $ref: '#/components/schemas/Address'
            billingAddress:
              $ref: '#/components/schemas/Address'
            paymentMethod:
              type: object
              required: [type]
              properties:
                type:
                  type: string
                  enum: [credit_card, debit_card, paypal]
                cardToken:
                  type: string
                  description: "Required for card payments"
            orderNotes:
              type: string
              maxLength: 500
  responses:
    201:
      description: Order created successfully
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                $ref: '#/components/schemas/OrderResponse'
    400:
      description: Invalid request
    402:
      description: Payment processing failed

GET /api/v1/orders:
  summary: Get user's orders
  security:
    - bearerAuth: []
  parameters:
    - name: status
      in: query
      schema:
        type: string
        enum: [pending, confirmed, processing, shipped, delivered, cancelled]
    - name: page
      in: query
      schema:
        type: integer
        minimum: 0
        default: 0
    - name: size
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 50
        default: 10
  responses:
    200:
      description: Orders retrieved successfully

GET /api/v1/orders/{orderId}:
  summary: Get order details
  security:
    - bearerAuth: []
  parameters:
    - name: orderId
      in: path
      required: true
      schema:
        type: string
        format: uuid
  responses:
    200:
      description: Order details
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
              data:
                $ref: '#/components/schemas/OrderDetailResponse'
    404:
      description: Order not found
    403:
      description: Access denied
```

### Schema Definitions

```yaml
components:
  schemas:
    UserResponse:
      type: object
      properties:
        userId:
          type: string
          format: uuid
        email:
          type: string
          format: email
        firstName:
          type: string
        lastName:
          type: string
        phone:
          type: string
        role:
          type: string
          enum: [consumer, seller, admin, super_admin]
        isActive:
          type: boolean
        isEmailVerified:
          type: boolean
        twoFactorEnabled:
          type: boolean
        createdAt:
          type: string
          format: date-time
        lastLogin:
          type: string
          format: date-time
    
    ProductResponse:
      type: object
      properties:
        productId:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        price:
          type: number
          format: decimal
        category:
          $ref: '#/components/schemas/CategoryResponse'
        seller:
          $ref: '#/components/schemas/SellerInfo'
        primaryImage:
          type: string
          format: uri
        rating:
          type: number
          format: float
          minimum: 0
          maximum: 5
        reviewCount:
          type: integer
        isActive:
          type: boolean
        createdAt:
          type: string
          format: date-time
    
    CartResponse:
      type: object
      properties:
        userId:
          type: string
          format: uuid
        items:
          type: array
          items:
            $ref: '#/components/schemas/CartItem'
        totalAmount:
          type: number
          format: decimal
        itemCount:
          type: integer
        updatedAt:
          type: string
          format: date-time
    
    CartItem:
      type: object
      properties:
        productId:
          type: string
          format: uuid
        productName:
          type: string
        productImage:
          type: string
          format: uri
        unitPrice:
          type: number
          format: decimal
        quantity:
          type: integer
        totalPrice:
          type: number
          format: decimal
        isAvailable:
          type: boolean
    
    OrderResponse:
      type: object
      properties:
        orderId:
          type: string
          format: uuid
        userId:
          type: string
          format: uuid
        totalAmount:
          type: number
          format: decimal
        status:
          type: string
          enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
        itemCount:
          type: integer
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        estimatedDelivery:
          type: string
          format: date
    
    Address:
      type: object
      required: [street, city, state, zipCode, country]
      properties:
        street:
          type: string
          maxLength: 255
        city:
          type: string
          maxLength: 100
        state:
          type: string
          maxLength: 100
        zipCode:
          type: string
          maxLength: 20
        country:
          type: string
          maxLength: 100
        isDefault:
          type: boolean
          default: false
  
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    cookieAuth:
      type: apiKey
      in: cookie
      name: refreshToken
```

## Sequence Diagrams

### User Registration Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as API Gateway
    participant US as User Service
    participant DB as Database
    participant ES as Email Service
    participant R as Redis
    
    U->>API: POST /auth/register
    API->>API: Rate limit check
    API->>US: Forward request
    US->>US: Validate input data
    US->>DB: Check email uniqueness
    DB-->>US: Email available
    US->>US: Hash password (bcrypt)
    US->>US: Generate verification token
    US->>DB: Create user record
    DB-->>US: User created
    US->>R: Store verification token
    US->>ES: Send verification email
    ES-->>US: Email queued
    US-->>API: Registration response
    API-->>U: 201 Created
    
    Note over ES: Async email sending
    ES->>ES: Process email queue
    ES->>U: Verification email sent
```

### Product Search Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as API Gateway
    participant PS as Product Service
    participant ES as Elasticsearch
    participant R as Redis
    participant DB as PostgreSQL
    
    U->>API: GET /products?q=laptop&category=electronics
    API->>PS: Forward search request
    PS->>R: Check cache
    R-->>PS: Cache miss
    PS->>ES: Execute search query
    ES-->>PS: Search results
    PS->>DB: Get additional product data
    DB-->>PS: Product details
    PS->>PS: Merge and format results
    PS->>R: Cache results (TTL: 5min)
    PS-->>API: Search response
    API-->>U: 200 OK with products
```

### Order Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as API Gateway
    participant OS as Order Service
    participant CS as Cart Service
    participant PS as Product Service
    participant PayS as Payment Service
    participant K as Kafka
    participant NS as Notification Service
    participant DB as Database
    
    U->>API: POST /orders (checkout)
    API->>OS: Create order request
    OS->>CS: Get user cart
    CS-->>OS: Cart items
    OS->>PS: Validate inventory
    PS-->>OS: Inventory confirmed
    OS->>DB: Begin transaction
    OS->>DB: Create order record
    OS->>PS: Reserve inventory
    PS-->>OS: Inventory reserved
    OS->>PayS: Process payment
    PayS->>PayS: Fraud detection
    PayS->>PayS: Gateway processing
    PayS-->>OS: Payment successful
    OS->>DB: Update order status
    OS->>CS: Clear cart
    OS->>DB: Commit transaction
    OS->>K: Publish order event
    OS-->>API: Order created
    API-->>U: 201 Created
    
    K->>NS: Order confirmation event
    NS->>U: Send confirmation email
    NS->>U: Send push notification
```

### Payment Processing Flow

```mermaid
sequenceDiagram
    participant OS as Order Service
    participant PS as Payment Service
    participant FD as Fraud Detection
    participant SG as Stripe Gateway
    participant PP as PayPal Gateway
    participant K as Kafka
    participant DB as Database
    
    OS->>PS: Process payment request
    PS->>FD: Run fraud checks
    FD->>FD: Velocity check
    FD->>FD: Amount validation
    FD->>FD: Geographic check
    FD-->>PS: Low risk score
    PS->>DB: Create payment record
    
    alt Credit Card Payment
        PS->>SG: Process card payment
        SG->>SG: Validate card
        SG->>SG: Charge amount
        SG-->>PS: Payment successful
    else PayPal Payment
        PS->>PP: Process PayPal payment
        PP->>PP: Validate account
        PP->>PP: Transfer funds
        PP-->>PS: Payment successful
    end
    
    PS->>DB: Update payment status
    PS->>K: Publish payment event
    PS-->>OS: Payment response
    
    K->>K: Event processing
    Note over K: Triggers inventory update,<br/>order confirmation, analytics
```

## Data Flow Diagrams

### High-Level Data Flow

```mermaid
flowchart TD
    U[User] --> LB[Load Balancer]
    LB --> AG[API Gateway]
    AG --> US[User Service]
    AG --> PS[Product Service]
    AG --> OS[Order Service]
    AG --> PayS[Payment Service]
    
    US --> PG[(PostgreSQL)]
    PS --> PG
    PS --> ES[(Elasticsearch)]
    OS --> PG
    PayS --> PG
    
    US --> R[(Redis)]
    PS --> R
    OS --> R
    
    OS --> K[Kafka]
    PayS --> K
    K --> NS[Notification Service]
    K --> AS[Analytics Service]
    
    NS --> Email[Email Provider]
    NS --> SMS[SMS Provider]
    NS --> Push[Push Service]
    
    PS --> S3[AWS S3]
    
    style U fill:#e1f5fe
    style PG fill:#f3e5f5
    style ES fill:#fff3e0
    style R fill:#ffebee
    style K fill:#e8f5e8
```

### User Authentication Data Flow

```mermaid
flowchart TD
    A[Login Request] --> B[Input Validation]
    B --> C[Rate Limit Check]
    C --> D[User Lookup]
    D --> E[Password Verification]
    E --> F[Account Status Check]
    F --> G[2FA Verification?]
    
    G -->|Yes| H[TOTP Validation]
    G -->|No| I[Generate JWT Tokens]
    H --> I
    
    I --> J[Update Last Login]
    J --> K[Store Session in Redis]
    K --> L[Set HTTP-Only Cookies]
    L --> M[Audit Log Entry]
    M --> N[Return Success Response]
    
    D -->|Not Found| O[Invalid Credentials]
    E -->|Failed| P[Increment Attempts]
    P --> Q[Check Lockout Threshold]
    Q -->|Exceeded| R[Lock Account]
    Q -->|Not Exceeded| O
    F -->|Inactive| S[Account Disabled]
    H -->|Invalid| T[2FA Failed]
    
    style A fill:#e3f2fd
    style N fill:#e8f5e8
    style O fill:#ffebee
    style R fill:#ffebee
    style S fill:#ffebee
    style T fill:#ffebee
```

### Order Processing Data Flow

```mermaid
flowchart TD
    A[Checkout Request] --> B[Cart Validation]
    B --> C[Inventory Check]
    C --> D[Price Calculation]
    D --> E[Create Order]
    E --> F[Reserve Inventory]
    F --> G[Process Payment]
    
    G --> H{Payment Success?}
    H -->|Yes| I[Confirm Order]
    H -->|No| J[Release Inventory]
    
    I --> K[Update Inventory]
    K --> L[Clear Cart]
    L --> M[Send Notifications]
    M --> N[Analytics Events]
    N --> O[Order Confirmed]
    
    J --> P[Payment Failed]
    
    C -->|Insufficient| Q[Inventory Error]
    
    style A fill:#e3f2fd
    style O fill:#e8f5e8
    style P fill:#ffebee
    style Q fill:#ffebee
```

## Security Implementation

### Authentication and Authorization

#### JWT Token Implementation

```typescript
// JWT Token Service
class TokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '7d';
  
  constructor() {
    this.accessTokenSecret = process.env.ACCESS_TOKEN_SECRET!;
    this.refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET!;
  }
  
  generateTokens(user: IUser): TokenPair {
    const payload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      permissions: this.getUserPermissions(user.role)
    };
    
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'ecommerce-platform',
      audience: 'ecommerce-users',
      subject: user.userId,
      jwtid: uuidv4()
    });
    
    const refreshToken = jwt.sign(
      { userId: user.userId, tokenId: uuidv4() },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'ecommerce-platform',
        audience: 'ecommerce-users',
        subject: user.userId
      }
    );
    
    return { accessToken, refreshToken };
  }
  
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.accessTokenSecret) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredException('Access token expired');
      }
      throw new InvalidTokenException('Invalid access token');
    }
  }
  
  private getUserPermissions(role: UserRole): string[] {
    const permissions: Record<UserRole, string[]> = {
      [UserRole.CONSUMER]: [
        'order:create', 'order:read', 'cart:manage', 'review:create'
      ],
      [UserRole.SELLER]: [
        'order:create', 'order:read', 'cart:manage', 'review:create',
        'product:create', 'product:update', 'product:read', 'inventory:manage'
      ],
      [UserRole.ADMIN]: [
        'order:*', 'product:*', 'user:*', 'review:*', 'analytics:read'
      ],
      [UserRole.SUPER_ADMIN]: ['*']
    };
    
    return permissions[role] || [];
  }
}
```

#### Authorization Middleware

```typescript
// Authorization Middleware
class AuthorizationMiddleware {
  static requirePermission(permission: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      if (!this.hasPermission(user.permissions, permission)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions'
        });
      }
      
      next();
    };
  }
  
  static requireRole(roles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const user = req.user;
      
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      next();
    };
  }
  
  private static hasPermission(userPermissions: string[], required: string): boolean {
    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }
    
    // Check for exact match
    if (userPermissions.includes(required)) {
      return true;
    }
    
    // Check for resource wildcard (e.g., 'order:*' matches 'order:create')
    const [resource] = required.split(':');
    if (userPermissions.includes(`${resource}:*`)) {
      return true;
    }
    
    return false;
  }
}
```

### Data Encryption

#### Field-Level Encryption

```java
// JPA Entity with Field Encryption
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID userId;
    
    @Column(nullable = false)
    private String email;
    
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "first_name")
    private String firstName;
    
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "last_name")
    private String lastName;
    
    @Convert(converter = EncryptedStringConverter.class)
    private String phone;
    
    // Other fields...
}

// Encryption Converter
@Component
public class EncryptedStringConverter implements AttributeConverter<String, String> {
    
    @Autowired
    private EncryptionService encryptionService;
    
    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null) {
            return null;
        }
        return encryptionService.encrypt(attribute);
    }
    
    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        return encryptionService.decrypt(dbData);
    }
}

// Encryption Service
@Service
public class EncryptionService {
    
    private final AESUtil aesUtil;
    
    public EncryptionService(@Value("${app.encryption.key}") String encryptionKey) {
        this.aesUtil = new AESUtil(encryptionKey);
    }
    
    public String encrypt(String plainText) {
        try {
            return aesUtil.encrypt(plainText);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt data", e);
        }
    }
    
    public String decrypt(String encryptedText) {
        try {
            return aesUtil.decrypt(encryptedText);
        } catch (Exception e) {
            throw new DecryptionException("Failed to decrypt data", e);
        }
    }
}

// AES Utility
public class AESUtil {
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 16;
    
    private final SecretKeySpec secretKey;
    
    public AESUtil(String key) {
        byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }
    
    public String encrypt(String plainText) throws Exception {
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        
        byte[] iv = new byte[GCM_IV_LENGTH];
        SecureRandom.getInstanceStrong().nextBytes(iv);
        
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, parameterSpec);
        
        byte[] encryptedText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        
        ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + encryptedText.length);
        byteBuffer.put(iv);
        byteBuffer.put(encryptedText);
        
        return Base64.getEncoder().encodeToString(byteBuffer.array());
    }
    
    public String decrypt(String encryptedText) throws Exception {
        byte[] decodedText = Base64.getDecoder().decode(encryptedText);
        
        ByteBuffer byteBuffer = ByteBuffer.wrap(decodedText);
        
        byte[] iv = new byte[GCM_IV_LENGTH];
        byteBuffer.get(iv);
        
        byte[] cipherText = new byte[byteBuffer.remaining()];
        byteBuffer.get(cipherText);
        
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);
        
        byte[] plainText = cipher.doFinal(cipherText);
        
        return new String(plainText, StandardCharsets.UTF_8);
    }
}
```

### Input Validation and Sanitization

```typescript
// Input Validation Schemas
import Joi from 'joi';

export const RegisterSchema = Joi.object({
  email: Joi.string()
    .email()
    .max(255)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'Password must be at least 8 characters long'
    }),
  
  firstName: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s'-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes'
    }),
  
  lastName: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s'-]+$/)
    .required(),
  
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please provide a valid phone number'
    })
});

export const ProductCreateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .required(),
  
  description: Joi.string()
    .trim()
    .max(5000)
    .optional(),
  
  price: Joi.number()
    .positive()
    .precision(2)
    .max(999999.99)
    .required(),
  
  categoryId: Joi.string()
    .uuid()
    .required(),
  
  sku: Joi.string()
    .trim()
    .max(100)
    .pattern(/^[A-Za-z0-9-_]+$/)
    .optional(),
  
  initialStock: Joi.number()
    .integer()
    .min(0)
    .max(999999)
    .default(0),
  
  reorderLevel: Joi.number()
    .integer()
    .min(0)
    .max(999999)
    .default(0)
});

// Validation Middleware
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    req.body = value;
    next();
  };
};

// HTML Sanitization
import DOMPurify from 'isomorphic-dompurify';

export class SanitizationService {
  static sanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: []
    });
  }
  
  static sanitizeText(input: string): string {
    return input
      .replace(/[<>"'&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[match];
      })
      .trim();
  }
}
```

## Error Handling

### Global Error Handler

```typescript
// Error Types
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;
  
  constructor(message: string, public readonly context?: any) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly isOperational = true;
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly isOperational = true;
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly isOperational = true;
}

export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = false;
}

// Global Error Handler Middleware
export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let appError: AppError;
  
  if (error instanceof AppError) {
    appError = error;
  } else if (error.name === 'ValidationError') {
    appError = new ValidationError(error.message);
  } else if (error.name === 'CastError') {
    appError = new ValidationError('Invalid data format');
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    appError = new ConflictError('Duplicate field value');
  } else {
    appError = new InternalServerError('Something went wrong');
  }
  
  // Log error for monitoring
  logger.error({
    error: {
      message: appError.message,
      stack: appError.stack,
      statusCode: appError.statusCode,
      isOperational: appError.isOperational,
      context: appError.context
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      user: (req as any).user?.userId
    }
  });
  
  // Send error response
  const response: ErrorResponse = {
    success: false,
    error: appError.message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: appError.stack,
      context: appError.context
    })
  };
  
  res.status(appError.statusCode).json(response);
};

// Circuit Breaker Implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly monitoringPeriod: number = 10000
  ) {}
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): string {
    return this.state;
  }
}

// Retry Logic with Exponential Backoff
export class RetryService {
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      retryCondition?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      retryCondition = () => true
    } = options;
    
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !retryCondition(error)) {
          throw error;
        }
        
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * delay;
        await this.sleep(delay + jitter);
      }
    }
    
    throw lastError;
  }
  
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Service-Specific Error Handling

```java
// Java Exception Handling
@ControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        logger.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse response = ErrorResponse.builder()
            .success(false)
            .error("Validation failed")
            .details(ex.getValidationErrors())
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.badRequest().body(response);
    }
    
    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleProductNotFound(ProductNotFoundException ex) {
        logger.warn("Product not found: {}", ex.getMessage());
        
        ErrorResponse response = ErrorResponse.builder()
            .success(false)
            .error("Product not found")
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
    }
    
    @ExceptionHandler(InsufficientInventoryException.class)
    public ResponseEntity<ErrorResponse> handleInsufficientInventory(InsufficientInventoryException ex) {
        logger.warn("Insufficient inventory: {}", ex.getMessage());
        
        ErrorResponse response = ErrorResponse.builder()
            .success(false)
            .error("Insufficient inventory")
            .details(Map.of(
                "availableQuantity", ex.getAvailableQuantity(),
                "requestedQuantity", ex.getRequestedQuantity()
            ))
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentProcessing(PaymentProcessingException ex) {
        logger.error("Payment processing error: {}", ex.getMessage(), ex);
        
        ErrorResponse response = ErrorResponse.builder()
            .success(false)
            .error("Payment processing failed")
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(response);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error occurred", ex);
        
        ErrorResponse response = ErrorResponse.builder()
            .success(false)
            .error("An unexpected error occurred")
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }
}

// Circuit Breaker with Resilience4j
@Component
public class ExternalServiceClient {
    
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;
    
    public ExternalServiceClient() {
        this.circuitBreaker = CircuitBreaker.ofDefaults("paymentService");
        this.retry = Retry.ofDefaults("paymentService");
    }
    
    public PaymentResponse processPayment(PaymentRequest request) {
        Supplier<PaymentResponse> decoratedSupplier = Decorators
            .ofSupplier(() -> callPaymentGateway(request))
            .withCircuitBreaker(circuitBreaker)
            .withRetry(retry)
            .withFallback(PaymentProcessingException.class, 
                ex -> handlePaymentFallback(request, ex))
            .decorate();
        
        return decoratedSupplier.get();
    }
    
    private PaymentResponse callPaymentGateway(PaymentRequest request) {
        // Actual payment gateway call
        // This method can throw PaymentProcessingException
        return paymentGateway.process(request);
    }
    
    private PaymentResponse handlePaymentFallback(PaymentRequest request, Exception ex) {
        logger.error("Payment processing failed, using fallback", ex);
        
        // Return a response indicating payment should be retried later
        return PaymentResponse.builder()
            .status(PaymentStatus.RETRY_LATER)
            .message("Payment service temporarily unavailable")
            .build();
    }
}
```

## Performance Optimization

### Caching Strategy

```typescript
// Redis Caching Service
export class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }
  
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }
  
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    let cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

// Cache Decorator
export function Cacheable(ttlSeconds: number, keyGenerator?: (...args: any[]) => string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator 
        ? keyGenerator(...args)
        : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      const cacheService = Container.get(CacheService);
      
      return cacheService.getOrSet(
        cacheKey,
        () => method.apply(this, args),
        ttlSeconds
      );
    };
    
    return descriptor;
  };
}

// Usage Example
class ProductService {
  @Cacheable(300, (productId: string) => `product:${productId}`)
  async getProduct(productId: string): Promise<Product> {
    return this.productRepository.findById(productId);
  }
  
  @Cacheable(600, (categoryId: string, page: number, size: number) => 
    `products:category:${categoryId}:${page}:${size}`)
  async getProductsByCategory(
    categoryId: string, 
    page: number, 
    size: number
  ): Promise<PagedResult<Product>> {
    return this.productRepository.findByCategory(categoryId, page, size);
  }
}
```

### Database Optimization

```sql
-- Database Performance Optimizations

-- Partitioning for large tables
CREATE TABLE orders_2024 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE orders_2023 PARTITION OF orders
FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

-- Materialized views for analytics
CREATE MATERIALIZED VIEW product_analytics AS
SELECT 
    p.product_id,
    p.name,
    p.price,
    COUNT(oi.item_id) as total_orders,
    SUM(oi.quantity) as total_quantity_sold,
    SUM(oi.total_price) as total_revenue,
    AVG(r.rating) as average_rating,
    COUNT(r.review_id) as review_count
FROM products p
LEFT JOIN order_items oi ON p.product_id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status = 'delivered'
LEFT JOIN reviews r ON p.product_id = r.product_id AND r.is_approved = true
WHERE p.is_active = true
GROUP BY p.product_id, p.name, p.price;

-- Refresh materialized view daily
CREATE OR REPLACE FUNCTION refresh_product_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY product_analytics;
END;
$$ LANGUAGE plpgsql;

-- Connection pooling configuration
-- max_connections = 200
-- shared_buffers = 256MB
-- effective_cache_size = 1GB
-- work_mem = 4MB
-- maintenance_work_mem = 64MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100
```

### API Performance

```typescript
// Response Compression Middleware
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
  level: 6 // Compression level (1-9)
}));

// Request Rate Limiting
import rateLimit from 'express-rate-limit';

const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
  });
};

// Different rate limits for different endpoints
app.use('/api/v1/auth/login', createRateLimit(15 * 60 * 1000, 5, 'Too many login attempts'));
app.use('/api/v1/auth/register', createRateLimit(15 * 60 * 1000, 3, 'Too many registration attempts'));
app.use('/api/v1/', createRateLimit(15 * 60 * 1000, 1000, 'Too many requests'));

// Response Pagination
interface PaginationOptions {
  page: number;
  size: number;
  maxSize?: number;
}

class PaginationService {
  static validatePagination(options: PaginationOptions): PaginationOptions {
    const { page, size, maxSize = 100 } = options;
    
    return {
      page: Math.max(0, page),
      size: Math.min(Math.max(1, size), maxSize),
      maxSize
    };
  }
  
  static createPagedResponse<T>(
    data: T[],
    totalElements: number,
    pagination: PaginationOptions
  ) {
    const totalPages = Math.ceil(totalElements / pagination.size);
    
    return {
      content: data,
      totalElements,
      totalPages,
      size: pagination.size,
      number: pagination.page,
      first: pagination.page === 0,
      last: pagination.page >= totalPages - 1,
      numberOfElements: data.length
    };
  }
}
```

## Deployment Specifications

### Kubernetes Deployment

```yaml
# User Service Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: ecommerce
  labels:
    app: user-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
      version: v1
  template:
    metadata:
      labels:
        app: user-service
        version: v1
    spec:
      containers:
      - name: user-service
        image: ecommerce/user-service:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: access-token-secret
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
          allowPrivilegeEscalation: false
          runAsNonRoot: true
          runAsUser: 1000
          capabilities:
            drop:
            - ALL
      imagePullSecrets:
      - name: registry-secret
---
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: ecommerce
  labels:
    app: user-service
spec:
  selector:
    app: user-service
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
  namespace: ecommerce
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
  maxReplicas: 20
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

### Infrastructure as Code (Terraform)

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

# Subnets
resource "aws_subnet" "private_subnets" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.ecommerce_vpc.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = var.availability_zones[count.index]
  
  tags = {
    Name = "ecommerce-private-subnet-${count.index + 1}"
    Environment = var.environment
  }
}

resource "aws_subnet" "public_subnets" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.ecommerce_vpc.id
  cidr_block              = "10.0.${count.index + 10}.0/24"
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  
  tags = {
    Name = "ecommerce-public-subnet-${count.index + 1}"
    Environment = var.environment
  }
}

# EKS Cluster
resource "aws_eks_cluster" "ecommerce_cluster" {
  name     = "ecommerce-cluster-${var.environment}"
  role_arn = aws_iam_role.eks_cluster_role.arn
  version  = "1.28"
  
  vpc_config {
    subnet_ids              = concat(aws_subnet.private_subnets[*].id, aws_subnet.public_subnets[*].id)
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }
  
  encryption_config {
    provider {
      key_arn = aws_kms_key.eks_encryption_key.arn
    }
    resources = ["secrets"]
  }
  
  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller,
  ]
  
  tags = {
    Name = "ecommerce-eks-cluster"
    Environment = var.environment
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "ecommerce_db" {
  identifier = "ecommerce-db-${var.environment}"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds_encryption_key.arn
  
  db_name  = "ecommerce"
  username = "postgres"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.ecommerce_db_subnet_group.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "ecommerce-db-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring_role.arn
  
  tags = {
    Name = "ecommerce-database"
    Environment = var.environment
  }
}

# ElastiCache Redis
resource "aws_elasticache_replication_group" "ecommerce_redis" {
  replication_group_id       = "ecommerce-redis-${var.environment}"
  description                = "Redis cluster for ecommerce platform"
  
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  subnet_group_name = aws_elasticache_subnet_group.ecommerce_redis_subnet_group.name
  security_group_ids = [aws_security_group.redis_sg.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = var.redis_auth_token
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format      = "text"
    log_type        = "slow-log"
  }
  
  tags = {
    Name = "ecommerce-redis"
    Environment = var.environment
  }
}
```

### CI/CD Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - test
  - security
  - build
  - deploy-staging
  - integration-tests
  - deploy-production

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"
  REGISTRY: $CI_REGISTRY
  IMAGE_TAG: $CI_COMMIT_SHA

# Test Stage
test:unit:
  stage: test
  image: node:18-alpine
  services:
    - postgres:15
    - redis:7-alpine
  variables:
    POSTGRES_DB: test_db
    POSTGRES_USER: test_user
    POSTGRES_PASSWORD: test_password
    DATABASE_URL: postgresql://test_user:test_password@postgres:5432/test_db
    REDIS_URL: redis://redis:6379
  before_script:
    - npm ci
  script:
    - npm run test:unit
    - npm run test:integration
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/
  only:
    - merge_requests
    - main
    - develop

# Security Scanning
security:sast:
  stage: security
  image: securecodewarrior/gitlab-sast:latest
  script:
    - sast-scan
  artifacts:
    reports:
      sast: gl-sast-report.json
  only:
    - merge_requests
    - main

security:dependency:
  stage: security
  image: node:18-alpine
  script:
    - npm audit --audit-level=high
    - npm run security:check
  allow_failure: false
  only:
    - merge_requests
    - main

# Container Security Scanning
security:container:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG
  dependencies:
    - build:docker
  only:
    - main

# Build Stage
build:docker:
  stage: build
  image: docker:20.10.16
  services:
    - docker:20.10.16-dind
  before_script:
    - echo $CI_REGISTRY_PASSWORD | docker login -u $CI_REGISTRY_USER --password-stdin $CI_REGISTRY
  script:
    - docker build -t $REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG .
    - docker push $REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG
    - docker tag $REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG $REGISTRY/$CI_PROJECT_PATH:latest
    - docker push $REGISTRY/$CI_PROJECT_PATH:latest
  only:
    - main
    - develop

# Staging Deployment
deploy:staging:
  stage: deploy-staging
  image: bitnami/kubectl:latest
  environment:
    name: staging
    url: https://staging.ecommerce.example.com
  before_script:
    - kubectl config use-context staging
  script:
    - envsubst < k8s/deployment.yaml | kubectl apply -f -
    - kubectl set image deployment/user-service user-service=$REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG -n ecommerce-staging
    - kubectl rollout status deployment/user-service -n ecommerce-staging --timeout=300s
  only:
    - develop
  when: manual

# Integration Tests
test:integration:
  stage: integration-tests
  image: node:18-alpine
  environment:
    name: staging
  variables:
    API_BASE_URL: https://staging-api.ecommerce.example.com
  script:
    - npm ci
    - npm run test:e2e
  artifacts:
    reports:
      junit: test-results.xml
  dependencies:
    - deploy:staging
  only:
    - develop

# Production Deployment
deploy:production:
  stage: deploy-production
  image: bitnami/kubectl:latest
  environment:
    name: production
    url: https://ecommerce.example.com
  before_script:
    - kubectl config use-context production
  script:
    # Blue-Green Deployment
    - ./scripts/blue-green-deploy.sh $REGISTRY/$CI_PROJECT_PATH:$IMAGE_TAG
  only:
    - main
  when: manual
  allow_failure: false
```

## Testing Strategy

### Unit Testing

```typescript
// User Service Unit Tests
import { UserService } from '../src/services/UserService';
import { UserRepository } from '../src/repositories/UserRepository';
import { PasswordService } from '../src/services/PasswordService';
import { EmailService } from '../src/services/EmailService';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockPasswordService: jest.Mocked<PasswordService>;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as jest.Mocked<UserRepository>;

    mockPasswordService = {
      hash: jest.fn(),
      verify: jest.fn(),
    } as jest.Mocked<PasswordService>;

    mockEmailService = {
      sendVerificationEmail: jest.fn(),
    } as jest.Mocked<EmailService>;

    userService = new UserService(
      mockUserRepository,
      mockPasswordService,
      mockEmailService
    );
  });

  describe('register', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe'
    };

    it('should successfully register a new user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockPasswordService.hash.mockResolvedValue('hashedPassword');
      mockUserRepository.create.mockResolvedValue({
        userId: 'user-123',
        email: validUserData.email,
        firstName: validUserData.firstName,
        lastName: validUserData.lastName,
        role: UserRole.CONSUMER,
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date()
      });
      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      // Act
      const result = await userService.register(validUserData);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validUserData.email);
      expect(mockPasswordService.hash).toHaveBeenCalledWith(validUserData.password);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email: validUserData.email,
        passwordHash: 'hashedPassword',
        firstName: validUserData.firstName,
        lastName: validUserData.lastName,
        role: UserRole.CONSUMER
      });
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
      expect(result.userId).toBe('user-123');
      expect(result.email).toBe(validUserData.email);
    });

    it('should throw ConflictError when email already exists', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue({
        userId: 'existing-user',
        email: validUserData.email
      } as any);

      // Act & Assert
      await expect(userService.register(validUserData))
        .rejects
        .toThrow(ConflictError);
      
      expect(mockPasswordService.hash).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should handle password hashing failure', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockPasswordService.hash.mockRejectedValue(new Error('Hashing failed'));

      // Act & Assert
      await expect(userService.register(validUserData))
        .rejects
        .toThrow('Hashing failed');
      
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'SecurePass123!'
    };

    it('should successfully authenticate user with valid credentials', async () => {
      // Arrange
      const mockUser = {
        userId: 'user-123',
        email: loginData.email,
        passwordHash: 'hashedPassword',
        isActive: true,
        loginAttempts: 0,
        lockoutUntil: null
      };
      
      mockUserRepository.findByEmail.mockResolvedValue(mockUser as any);
      mockPasswordService.verify.mockResolvedValue(true);
      mockUserRepository.update.mockResolvedValue(undefined);

      // Act
      const result = await userService.login(loginData);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(loginData.email);
      expect(mockPasswordService.verify).toHaveBeenCalledWith(
        loginData.password,
        mockUser.passwordHash
      );
      expect(result.user.userId).toBe('user-123');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedError for invalid password', async () => {
      // Arrange
      const mockUser = {
        userId: 'user-123',
        email: loginData.email,
        passwordHash: 'hashedPassword',
        isActive: true,
        loginAttempts: 0,
        lockoutUntil: null
      };
      
      mockUserRepository.findByEmail.mockResolvedValue(mockUser as any);
      mockPasswordService.verify.mockResolvedValue(false);

      // Act & Assert
      await expect(userService.login(loginData))
        .rejects
        .toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(userService.login(loginData))
        .rejects
        .toThrow(UnauthorizedError);
      
      expect(mockPasswordService.verify).not.toHaveBeenCalled();
    });
  });
});
```

### Integration Testing

```typescript
// Order Service Integration Tests
import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './helpers/database';
import { createTestUser, getAuthToken } from './helpers/auth';
import { createTestProduct } from './helpers/products';

describe('Order API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let productId: string;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Create test user and get auth token
    const user = await createTestUser({
      email: 'test@example.com',
      password: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe'
    });
    userId = user.userId;
    authToken = await getAuthToken(user);

    // Create test product
    const product = await createTestProduct({
      name: 'Test Product',
      price: 99.99,
      inventory: 10
    });
    productId = product.productId;
  });

  describe('POST /api/v1/cart/items', () => {
    it('should add item to cart successfully', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId,
          quantity: 2
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].productId).toBe(productId);
      expect(response.body.data.items[0].quantity).toBe(2);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: '123e4567-e89b-12d3-a456-426614174000',
          quantity: 1
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Product not found');
    });

    it('should return 409 for insufficient inventory', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId,
          quantity: 15 // More than available inventory (10)
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient inventory');
    });
  });

  describe('POST /api/v1/orders', () => {
    beforeEach(async () => {
      // Add item to cart before creating order
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId,
          quantity: 2
        });
    });

    it('should create order successfully with valid payment', async () => {
      const orderData = {
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        billingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        paymentMethod: {
          type: 'credit_card',
          cardToken: 'tok_visa' // Test token
        }
      };

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBeDefined();
      expect(response.body.data.status).toBe('confirmed');
      expect(response.body.data.totalAmount).toBe(199.98); // 2 * 99.99
    });

    it('should return 400 for empty cart', async () => {
      // Clear the cart first
      await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${authToken}`);

      const orderData = {
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        billingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        paymentMethod: {
          type: 'credit_card',
          cardToken: 'tok_visa'
        }
      };

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('empty cart');
    });
  });
});
```

### End-to-End Testing

```typescript
// E2E Tests using Playwright
import { test, expect, Page } from '@playwright/test';

test.describe('E-commerce Platform E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('https://staging.ecommerce.example.com');
  });

  test('complete user journey: register, browse, purchase', async () => {
    // Step 1: User Registration
    await page.click('text=Sign Up');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.fill('[data-testid="firstName"]', 'John');
    await page.fill('[data-testid="lastName"]', 'Doe');
    await page.click('[data-testid="register-button"]');
    
    // Verify registration success
    await expect(page.locator('[data-testid="success-message"]'))
      .toContainText('Registration successful');

    // Step 2: Email Verification (simulate)
    // In a real test, you might check email or use a test email service
    await page.goto('/verify-email?token=test-token');
    await expect(page.locator('[data-testid="verification-success"]'))
      .toBeVisible();

    // Step 3: Login
    await page.click('text=Sign In');
    await page.fill('[data-testid="login-email"]', 'test@example.com');
    await page.fill('[data-testid="login-password"]', 'SecurePass123!');
    await page.click('[data-testid="login-button"]');
    
    // Verify login success
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // Step 4: Browse Products
    await page.click('[data-testid="products-link"]');
    await page.fill('[data-testid="search-input"]', 'laptop');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Wait for search results
    await expect(page.locator('[data-testid="product-card"]').first())
      .toBeVisible();

    // Step 5: Add to Cart
    await page.click('[data-testid="product-card"]').first();
    await page.click('[data-testid="add-to-cart-button"]');
    
    // Verify cart update
    await expect(page.locator('[data-testid="cart-count"]'))
      .toContainText('1');

    // Step 6: Checkout Process
    await page.click('[data-testid="cart-icon"]');
    await page.click('[data-testid="checkout-button"]');
    
    // Fill shipping information
    await page.fill('[data-testid="shipping-street"]', '123 Main St');
    await page.fill('[data-testid="shipping-city"]', 'Anytown');
    await page.fill('[data-testid="shipping-state"]', 'CA');
    await page.fill('[data-testid="shipping-zip"]', '12345');
    await page.selectOption('[data-testid="shipping-country"]', 'USA');
    
    await page.click('[data-testid="continue-to-payment"]');
    
    // Fill payment information (using test card)
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');
    await page.fill('[data-testid="card-name"]', 'John Doe');
    
    await page.click('[data-testid="place-order-button"]');
    
    // Verify order success
    await expect(page.locator('[data-testid="order-confirmation"]'))
      .toBeVisible();
    
    const orderNumber = await page.locator('[data-testid="order-number"]')
      .textContent();
    expect(orderNumber).toMatch(/^ORD-\d+$/);

    // Step 7: Verify Order in Account
    await page.click('[data-testid="user-menu"]');
    await page.click('text=My Orders');
    
    await expect(page.locator(`[data-testid="order-${orderNumber}"]`))
      .toBeVisible();
  });

  test('product search and filtering', async () => {
    await page.goto('/products');
    
    // Test search functionality
    await page.fill('[data-testid="search-input"]', 'smartphone');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    await page.waitForSelector('[data-testid="product-card"]');
    const searchResults = await page.locator('[data-testid="product-card"]').count();
    expect(searchResults).toBeGreaterThan(0);
    
    // Test price filtering
    await page.fill('[data-testid="min-price"]', '100');
    await page.fill('[data-testid="max-price"]', '500');
    await page.click('[data-testid="apply-filters"]');
    
    // Verify filtered results
    const filteredResults = await page.locator('[data-testid="product-card"]').count();
    expect(filteredResults).toBeLessThanOrEqual(searchResults);
    
    // Test category filtering
    await page.click('[data-testid="category-electronics"]');
    await page.waitForLoadState('networkidle');
    
    const categoryResults = await page.locator('[data-testid="product-card"]').count();
    expect(categoryResults).toBeGreaterThan(0);
  });

  test('cart management', async () => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', 'test@example.com');
    await page.fill('[data-testid="login-password"]', 'SecurePass123!');
    await page.click('[data-testid="login-button"]');
    
    // Add multiple items to cart
    await page.goto('/products');
    
    const productCards = page.locator('[data-testid="product-card"]');
    const firstProduct = productCards.first();
    const secondProduct = productCards.nth(1);
    
    // Add first product
    await firstProduct.click();
    await page.click('[data-testid="add-to-cart-button"]');
    await page.goBack();
    
    // Add second product
    await secondProduct.click();
    await page.click('[data-testid="add-to-cart-button"]');
    
    // Go to cart
    await page.click('[data-testid="cart-icon"]');
    
    // Verify cart contents
    const cartItems = await page.locator('[data-testid="cart-item"]').count();
    expect(cartItems).toBe(2);
    
    // Test quantity update
    await page.click('[data-testid="increase-quantity"]').first();
    await expect(page.locator('[data-testid="item-quantity"]').first())
      .toContainText('2');
    
    // Test item removal
    await page.click('[data-testid="remove-item"]').first();
    const updatedCartItems = await page.locator('[data-testid="cart-item"]').count();
    expect(updatedCartItems).toBe(1);
  });
});
```

## Conclusion

This Low-Level Design document provides comprehensive technical specifications for implementing the Online Shopping Platform. The design includes:

1. **Detailed Component Specifications** with complete code implementations
2. **Comprehensive Database Design** with optimized schemas and indexes
3. **Complete API Specifications** with OpenAPI documentation
4. **Detailed Security Implementation** with encryption, authentication, and authorization
5. **Robust Error Handling** with circuit breakers and retry mechanisms
6. **Performance Optimization** strategies including caching and database tuning
7. **Production-Ready Deployment** configurations for Kubernetes and cloud infrastructure
8. **Comprehensive Testing Strategy** covering unit, integration, and end-to-end testing

The implementation follows enterprise-grade best practices including:
- **Security-First Approach**: Multi-layered security with encryption, secure authentication, and comprehensive audit logging
- **Scalability**: Horizontal scaling capabilities with auto-scaling and load balancing
- **Reliability**: Circuit breakers, retry logic, and graceful degradation
- **Maintainability**: Clean architecture, comprehensive testing, and detailed documentation
- **Compliance**: Built-in support for PCI-DSS, GDPR, and SOC2 requirements

This LLD serves as the definitive technical blueprint for development teams to build a robust, scalable, and secure e-commerce platform that meets enterprise requirements and industry standards.