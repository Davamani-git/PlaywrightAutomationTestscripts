# Low-Level Design Document (LLD)

## 1. System Overview

This Low-Level Design document provides detailed implementation specifications for the E-commerce Platform based on the High-Level Design requirements. The system implements a microservices architecture with secure, scalable, and compliant components.

## 2. Detailed Component Specifications

### 2.1 Authentication & Authorization Service

#### 2.1.1 Component Architecture
```
AuthController
├── AuthService
│   ├── JWTTokenManager
│   ├── PasswordManager
│   ├── MFAManager
│   └── SessionManager
├── UserRepository
├── RoleRepository
└── PermissionRepository
```

#### 2.1.2 Class Specifications

**AuthController**
```java
@RestController
@RequestMapping("/api/v1/auth")
@Validated
public class AuthController {
    
    @Autowired
    private AuthService authService;
    
    @PostMapping("/login")
    @RateLimited(requests = 5, window = "1m")
    public ResponseEntity<AuthResponse> login(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest httpRequest) {
        
        String clientIp = getClientIpAddress(httpRequest);
        AuthResponse response = authService.authenticate(
            request.getEmail(), 
            request.getPassword(), 
            clientIp
        );
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/register")
    @RateLimited(requests = 3, window = "1m")
    public ResponseEntity<AuthResponse> register(
        @Valid @RequestBody RegisterRequest request) {
        
        AuthResponse response = authService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refreshToken(
        @Valid @RequestBody RefreshTokenRequest request) {
        
        TokenResponse response = authService.refreshAccessToken(
            request.getRefreshToken()
        );
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/logout")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Void> logout(
        @RequestHeader("Authorization") String authHeader) {
        
        String token = extractTokenFromHeader(authHeader);
        authService.logout(token);
        return ResponseEntity.ok().build();
    }
}
```

**AuthService**
```java
@Service
@Transactional
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private JWTTokenManager jwtTokenManager;
    
    @Autowired
    private PasswordManager passwordManager;
    
    @Autowired
    private MFAManager mfaManager;
    
    @Autowired
    private SessionManager sessionManager;
    
    @Autowired
    private AuditLogger auditLogger;
    
    public AuthResponse authenticate(String email, String password, String clientIp) {
        try {
            // Input validation
            validateEmailFormat(email);
            validatePasswordStrength(password);
            
            // Rate limiting check
            if (isRateLimited(email, clientIp)) {
                throw new RateLimitExceededException("Too many login attempts");
            }
            
            // User lookup
            User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
            
            // Account status validation
            validateAccountStatus(user);
            
            // Password verification
            if (!passwordManager.verifyPassword(password, user.getPasswordHash())) {
                auditLogger.logFailedLogin(email, clientIp);
                incrementFailedAttempts(user);
                throw new InvalidCredentialsException("Invalid credentials");
            }
            
            // MFA verification if enabled
            if (user.isMfaEnabled()) {
                return initiateMfaChallenge(user, clientIp);
            }
            
            // Generate tokens
            String accessToken = jwtTokenManager.generateAccessToken(user);
            String refreshToken = jwtTokenManager.generateRefreshToken(user);
            
            // Create session
            sessionManager.createSession(user.getUserId(), accessToken, clientIp);
            
            // Reset failed attempts
            resetFailedAttempts(user);
            
            // Update last login
            user.setLastLoginAt(LocalDateTime.now());
            userRepository.save(user);
            
            // Audit log
            auditLogger.logSuccessfulLogin(user.getUserId(), clientIp);
            
            return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtTokenManager.getAccessTokenExpiry())
                .user(UserDto.from(user))
                .build();
                
        } catch (Exception e) {
            auditLogger.logAuthenticationError(email, clientIp, e.getMessage());
            throw e;
        }
    }
    
    public AuthResponse registerUser(RegisterRequest request) {
        // Email uniqueness validation
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new EmailAlreadyExistsException("Email already registered");
        }
        
        // Password strength validation
        passwordManager.validatePasswordStrength(request.getPassword());
        
        // Create user entity
        User user = User.builder()
            .userId(UUID.randomUUID().toString())
            .email(request.getEmail().toLowerCase())
            .passwordHash(passwordManager.hashPassword(request.getPassword()))
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .phoneNumber(request.getPhoneNumber())
            .isActive(false) // Requires email verification
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        
        // Save user
        user = userRepository.save(user);
        
        // Assign default role
        assignDefaultRole(user);
        
        // Send verification email
        emailService.sendVerificationEmail(user);
        
        // Audit log
        auditLogger.logUserRegistration(user.getUserId());
        
        return AuthResponse.builder()
            .message("Registration successful. Please verify your email.")
            .user(UserDto.from(user))
            .build();
    }
}
```

**JWTTokenManager**
```java
@Component
public class JWTTokenManager {
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.access-token-expiry:900}")
    private int accessTokenExpiry; // 15 minutes
    
    @Value("${jwt.refresh-token-expiry:604800}")
    private int refreshTokenExpiry; // 7 days
    
    private final Algorithm algorithm;
    
    @PostConstruct
    public void init() {
        this.algorithm = Algorithm.HMAC256(jwtSecret);
    }
    
    public String generateAccessToken(User user) {
        return JWT.create()
            .withSubject(user.getUserId())
            .withClaim("email", user.getEmail())
            .withClaim("roles", user.getRoles().stream()
                .map(Role::getRoleName)
                .collect(Collectors.toList()))
            .withClaim("permissions", getPermissions(user))
            .withIssuedAt(new Date())
            .withExpiresAt(new Date(System.currentTimeMillis() + accessTokenExpiry * 1000))
            .withIssuer("ecommerce-platform")
            .sign(algorithm);
    }
    
    public String generateRefreshToken(User user) {
        return JWT.create()
            .withSubject(user.getUserId())
            .withClaim("type", "refresh")
            .withIssuedAt(new Date())
            .withExpiresAt(new Date(System.currentTimeMillis() + refreshTokenExpiry * 1000))
            .withIssuer("ecommerce-platform")
            .sign(algorithm);
    }
    
    public DecodedJWT validateToken(String token) {
        try {
            JWTVerifier verifier = JWT.require(algorithm)
                .withIssuer("ecommerce-platform")
                .build();
            return verifier.verify(token);
        } catch (JWTVerificationException e) {
            throw new InvalidTokenException("Invalid or expired token", e);
        }
    }
    
    public boolean isTokenBlacklisted(String token) {
        return redisTemplate.hasKey("blacklist:" + token);
    }
    
    public void blacklistToken(String token, long expiryTime) {
        redisTemplate.opsForValue().set(
            "blacklist:" + token, 
            "true", 
            expiryTime, 
            TimeUnit.SECONDS
        );
    }
}
```

### 2.2 Product Catalog Service

#### 2.2.1 Component Architecture
```
ProductController
├── ProductService
│   ├── ProductSearchService
│   ├── CategoryService
│   ├── InventoryService
│   └── ImageService
├── ProductRepository
├── CategoryRepository
├── InventoryRepository
└── ElasticsearchRepository
```

#### 2.2.2 Class Specifications

**ProductController**
```java
@RestController
@RequestMapping("/api/v1/products")
@Validated
public class ProductController {
    
    @Autowired
    private ProductService productService;
    
    @Autowired
    private ProductSearchService searchService;
    
    @GetMapping
    @Cacheable(value = "products", key = "#pageable.pageNumber + '-' + #pageable.pageSize")
    public ResponseEntity<PagedResponse<ProductDto>> getProducts(
        @PageableDefault(size = 20) Pageable pageable,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String seller,
        @RequestParam(required = false) Boolean inStock) {
        
        ProductFilter filter = ProductFilter.builder()
            .category(category)
            .seller(seller)
            .inStock(inStock)
            .build();
            
        PagedResponse<ProductDto> response = productService.getProducts(filter, pageable);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/search")
    public ResponseEntity<PagedResponse<ProductDto>> searchProducts(
        @RequestParam String query,
        @RequestParam(required = false) String category,
        @RequestParam(required = false, defaultValue = "0") BigDecimal minPrice,
        @RequestParam(required = false) BigDecimal maxPrice,
        @RequestParam(required = false, defaultValue = "relevance") String sortBy,
        @PageableDefault(size = 20) Pageable pageable) {
        
        SearchCriteria criteria = SearchCriteria.builder()
            .query(query)
            .category(category)
            .minPrice(minPrice)
            .maxPrice(maxPrice)
            .sortBy(sortBy)
            .build();
            
        PagedResponse<ProductDto> response = searchService.searchProducts(criteria, pageable);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/{productId}")
    @Cacheable(value = "product", key = "#productId")
    public ResponseEntity<ProductDetailDto> getProductById(
        @PathVariable String productId) {
        
        ProductDetailDto product = productService.getProductById(productId);
        return ResponseEntity.ok(product);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductDto> createProduct(
        @Valid @RequestBody CreateProductRequest request,
        Authentication authentication) {
        
        String sellerId = extractSellerIdFromAuth(authentication);
        ProductDto product = productService.createProduct(request, sellerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(product);
    }
    
    @PutMapping("/{productId}")
    @PreAuthorize("@productService.isProductOwner(#productId, authentication.name) or hasRole('ADMIN')")
    @CacheEvict(value = {"product", "products"}, allEntries = true)
    public ResponseEntity<ProductDto> updateProduct(
        @PathVariable String productId,
        @Valid @RequestBody UpdateProductRequest request,
        Authentication authentication) {
        
        ProductDto product = productService.updateProduct(productId, request);
        return ResponseEntity.ok(product);
    }
    
    @DeleteMapping("/{productId}")
    @PreAuthorize("@productService.isProductOwner(#productId, authentication.name) or hasRole('ADMIN')")
    @CacheEvict(value = {"product", "products"}, allEntries = true)
    public ResponseEntity<Void> deleteProduct(
        @PathVariable String productId) {
        
        productService.deleteProduct(productId);
        return ResponseEntity.noContent().build();
    }
}
```

**ProductService**
```java
@Service
@Transactional
public class ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private CategoryRepository categoryRepository;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private ImageService imageService;
    
    @Autowired
    private ElasticsearchService elasticsearchService;
    
    @Autowired
    private EventPublisher eventPublisher;
    
    public ProductDto createProduct(CreateProductRequest request, String sellerId) {
        // Validate seller permissions
        validateSellerPermissions(sellerId);
        
        // Validate category exists
        Category category = categoryRepository.findById(request.getCategoryId())
            .orElseThrow(() -> new CategoryNotFoundException("Category not found"));
        
        // Create product entity
        Product product = Product.builder()
            .productId(UUID.randomUUID().toString())
            .sellerId(sellerId)
            .categoryId(request.getCategoryId())
            .productName(request.getProductName())
            .description(request.getDescription())
            .price(request.getPrice())
            .sku(generateSKU(sellerId, request.getProductName()))
            .specifications(request.getSpecifications())
            .weight(request.getWeight())
            .dimensions(request.getDimensions())
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        
        // Save product
        product = productRepository.save(product);
        
        // Process and save images
        if (request.getImages() != null && !request.getImages().isEmpty()) {
            List<String> imageUrls = imageService.processAndSaveImages(
                product.getProductId(), 
                request.getImages()
            );
            product.setImages(imageUrls);
            product = productRepository.save(product);
        }
        
        // Create initial inventory
        inventoryService.createInventory(
            product.getProductId(), 
            request.getInitialStock()
        );
        
        // Index in Elasticsearch
        elasticsearchService.indexProduct(product);
        
        // Publish product created event
        eventPublisher.publishEvent(new ProductCreatedEvent(product));
        
        return ProductDto.from(product);
    }
    
    public PagedResponse<ProductDto> getProducts(ProductFilter filter, Pageable pageable) {
        // Build query specification
        Specification<Product> spec = ProductSpecification.builder()
            .withCategory(filter.getCategory())
            .withSeller(filter.getSeller())
            .withInStock(filter.getInStock())
            .withActiveStatus(true)
            .build();
        
        // Execute query
        Page<Product> productPage = productRepository.findAll(spec, pageable);
        
        // Convert to DTOs
        List<ProductDto> products = productPage.getContent().stream()
            .map(ProductDto::from)
            .collect(Collectors.toList());
        
        return PagedResponse.<ProductDto>builder()
            .content(products)
            .page(productPage.getNumber())
            .size(productPage.getSize())
            .totalElements(productPage.getTotalElements())
            .totalPages(productPage.getTotalPages())
            .first(productPage.isFirst())
            .last(productPage.isLast())
            .build();
    }
    
    public ProductDetailDto getProductById(String productId) {
        Product product = productRepository.findByIdAndIsActive(productId, true)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
        
        // Get inventory information
        Inventory inventory = inventoryService.getInventoryByProductId(productId);
        
        // Get reviews summary
        ReviewSummary reviewSummary = reviewService.getReviewSummary(productId);
        
        // Get related products
        List<ProductDto> relatedProducts = getRelatedProducts(product.getCategoryId(), productId);
        
        return ProductDetailDto.builder()
            .product(ProductDto.from(product))
            .inventory(InventoryDto.from(inventory))
            .reviewSummary(reviewSummary)
            .relatedProducts(relatedProducts)
            .build();
    }
    
    private String generateSKU(String sellerId, String productName) {
        String prefix = sellerId.substring(0, Math.min(3, sellerId.length())).toUpperCase();
        String productCode = productName.replaceAll("[^a-zA-Z0-9]", "")
            .substring(0, Math.min(6, productName.length())).toUpperCase();
        String timestamp = String.valueOf(System.currentTimeMillis()).substring(8);
        return prefix + "-" + productCode + "-" + timestamp;
    }
}
```

### 2.3 Order Management Service

#### 2.3.1 Component Architecture
```
OrderController
├── OrderService
│   ├── OrderValidationService
│   ├── OrderStateMachine
│   ├── InventoryReservationService
│   └── NotificationService
├── OrderRepository
├── OrderItemRepository
└── PaymentService (External)
```

#### 2.3.2 Class Specifications

**OrderController**
```java
@RestController
@RequestMapping("/api/v1/orders")
@Validated
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<OrderDto> createOrder(
        @Valid @RequestBody CreateOrderRequest request,
        Authentication authentication) {
        
        String userId = authentication.getName();
        OrderDto order = orderService.createOrder(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
    
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<PagedResponse<OrderSummaryDto>> getUserOrders(
        @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable,
        Authentication authentication) {
        
        String userId = authentication.getName();
        PagedResponse<OrderSummaryDto> orders = orderService.getUserOrders(userId, pageable);
        return ResponseEntity.ok(orders);
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("@orderService.isOrderOwner(#orderId, authentication.name) or hasRole('ADMIN')")
    public ResponseEntity<OrderDetailDto> getOrderById(
        @PathVariable String orderId) {
        
        OrderDetailDto order = orderService.getOrderById(orderId);
        return ResponseEntity.ok(order);
    }
    
    @PutMapping("/{orderId}/cancel")
    @PreAuthorize("@orderService.isOrderOwner(#orderId, authentication.name)")
    public ResponseEntity<OrderDto> cancelOrder(
        @PathVariable String orderId,
        @Valid @RequestBody CancelOrderRequest request) {
        
        OrderDto order = orderService.cancelOrder(orderId, request.getReason());
        return ResponseEntity.ok(order);
    }
    
    @PutMapping("/{orderId}/status")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<OrderDto> updateOrderStatus(
        @PathVariable String orderId,
        @Valid @RequestBody UpdateOrderStatusRequest request,
        Authentication authentication) {
        
        OrderDto order = orderService.updateOrderStatus(
            orderId, 
            request.getStatus(), 
            request.getNotes(),
            authentication.getName()
        );
        return ResponseEntity.ok(order);
    }
    
    @GetMapping("/{orderId}/tracking")
    public ResponseEntity<OrderTrackingDto> getOrderTracking(
        @PathVariable String orderId) {
        
        OrderTrackingDto tracking = orderService.getOrderTracking(orderId);
        return ResponseEntity.ok(tracking);
    }
}
```

**OrderService**
```java
@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private OrderItemRepository orderItemRepository;
    
    @Autowired
    private CartService cartService;
    
    @Autowired
    private InventoryReservationService inventoryReservationService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private NotificationService notificationService;
    
    @Autowired
    private OrderStateMachine orderStateMachine;
    
    @Autowired
    private EventPublisher eventPublisher;
    
    public OrderDto createOrder(CreateOrderRequest request, String userId) {
        try {
            // Validate cart contents
            Cart cart = cartService.getCartByUserId(userId);
            if (cart.getItems().isEmpty()) {
                throw new EmptyCartException("Cannot create order from empty cart");
            }
            
            // Validate inventory availability
            validateInventoryAvailability(cart.getItems());
            
            // Calculate order totals
            OrderCalculation calculation = calculateOrderTotals(
                cart.getItems(), 
                request.getShippingAddress()
            );
            
            // Generate order number
            String orderNumber = generateOrderNumber();
            
            // Create order entity
            Order order = Order.builder()
                .orderId(UUID.randomUUID().toString())
                .userId(userId)
                .orderNumber(orderNumber)
                .orderStatus(OrderStatus.PENDING)
                .totalAmount(calculation.getTotalAmount())
                .taxAmount(calculation.getTaxAmount())
                .shippingAmount(calculation.getShippingAmount())
                .discountAmount(calculation.getDiscountAmount())
                .paymentStatus(PaymentStatus.PENDING)
                .shippingAddress(request.getShippingAddress())
                .billingAddress(request.getBillingAddress())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
            
            // Save order
            order = orderRepository.save(order);
            
            // Create order items
            List<OrderItem> orderItems = createOrderItems(order.getOrderId(), cart.getItems());
            orderItemRepository.saveAll(orderItems);
            
            // Reserve inventory
            inventoryReservationService.reserveInventory(orderItems);
            
            // Process payment
            PaymentResult paymentResult = paymentService.processPayment(
                order.getOrderId(),
                request.getPaymentMethod(),
                calculation.getTotalAmount()
            );
            
            // Update order with payment information
            order.setPaymentStatus(paymentResult.getStatus());
            order = orderRepository.save(order);
            
            // Clear cart
            cartService.clearCart(userId);
            
            // Send order confirmation
            notificationService.sendOrderConfirmation(order);
            
            // Publish order created event
            eventPublisher.publishEvent(new OrderCreatedEvent(order));
            
            return OrderDto.from(order, orderItems);
            
        } catch (Exception e) {
            // Rollback inventory reservations if any were made
            rollbackInventoryReservations(userId);
            throw e;
        }
    }
    
    public OrderDto updateOrderStatus(String orderId, OrderStatus newStatus, String notes, String updatedBy) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException("Order not found"));
        
        // Validate status transition
        if (!orderStateMachine.canTransition(order.getOrderStatus(), newStatus)) {
            throw new InvalidStatusTransitionException(
                String.format("Cannot transition from %s to %s", 
                    order.getOrderStatus(), newStatus)
            );
        }
        
        OrderStatus previousStatus = order.getOrderStatus();
        order.setOrderStatus(newStatus);
        order.setUpdatedAt(LocalDateTime.now());
        
        // Handle status-specific logic
        switch (newStatus) {
            case CONFIRMED:
                handleOrderConfirmation(order);
                break;
            case SHIPPED:
                handleOrderShipment(order);
                break;
            case DELIVERED:
                handleOrderDelivery(order);
                break;
            case CANCELLED:
                handleOrderCancellation(order);
                break;
        }
        
        order = orderRepository.save(order);
        
        // Create status history entry
        createOrderStatusHistory(order, previousStatus, newStatus, notes, updatedBy);
        
        // Send status update notification
        notificationService.sendOrderStatusUpdate(order, previousStatus, newStatus);
        
        // Publish order status changed event
        eventPublisher.publishEvent(new OrderStatusChangedEvent(order, previousStatus, newStatus));
        
        List<OrderItem> orderItems = orderItemRepository.findByOrderId(orderId);
        return OrderDto.from(order, orderItems);
    }
    
    private void validateInventoryAvailability(List<CartItem> items) {
        for (CartItem item : items) {
            Inventory inventory = inventoryService.getInventoryByProductId(item.getProductId());
            if (inventory.getAvailableStock() < item.getQuantity()) {
                throw new InsufficientInventoryException(
                    String.format("Insufficient stock for product %s. Available: %d, Requested: %d",
                        item.getProductId(), inventory.getAvailableStock(), item.getQuantity())
                );
            }
        }
    }
    
    private OrderCalculation calculateOrderTotals(List<CartItem> items, Address shippingAddress) {
        BigDecimal subtotal = items.stream()
            .map(item -> item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        BigDecimal taxAmount = taxCalculationService.calculateTax(subtotal, shippingAddress);
        BigDecimal shippingAmount = shippingCalculationService.calculateShipping(items, shippingAddress);
        BigDecimal discountAmount = discountService.calculateDiscount(items, subtotal);
        
        BigDecimal totalAmount = subtotal
            .add(taxAmount)
            .add(shippingAmount)
            .subtract(discountAmount);
        
        return OrderCalculation.builder()
            .subtotal(subtotal)
            .taxAmount(taxAmount)
            .shippingAmount(shippingAmount)
            .discountAmount(discountAmount)
            .totalAmount(totalAmount)
            .build();
    }
    
    private String generateOrderNumber() {
        String prefix = "ORD";
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String sequence = String.format("%06d", orderRepository.getNextSequenceNumber());
        return prefix + "-" + timestamp + "-" + sequence;
    }
}
```

### 2.4 Payment Processing Service

#### 2.4.1 Component Architecture
```
PaymentController
├── PaymentService
│   ├── PaymentGatewayManager
│   ├── FraudDetectionService
│   ├── PaymentTokenService
│   └── RefundService
├── PaymentRepository
├── RefundRepository
└── External Gateways (Stripe, PayPal)
```

#### 2.4.2 Class Specifications

**PaymentService**
```java
@Service
@Transactional
public class PaymentService {
    
    @Autowired
    private PaymentRepository paymentRepository;
    
    @Autowired
    private PaymentGatewayManager gatewayManager;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    @Autowired
    private PaymentTokenService tokenService;
    
    @Autowired
    private EventPublisher eventPublisher;
    
    public PaymentResult processPayment(String orderId, PaymentMethodDto paymentMethod, BigDecimal amount) {
        try {
            // Validate payment amount
            validatePaymentAmount(amount);
            
            // Fraud detection check
            FraudAssessment fraudAssessment = fraudDetectionService.assessPayment(
                orderId, paymentMethod, amount
            );
            
            if (fraudAssessment.getRiskLevel() == RiskLevel.HIGH) {
                throw new FraudDetectedException("Payment blocked due to high fraud risk");
            }
            
            // Create payment record
            Payment payment = Payment.builder()
                .paymentId(UUID.randomUUID().toString())
                .orderId(orderId)
                .paymentMethod(paymentMethod.getType())
                .amount(amount)
                .currency("USD")
                .paymentStatus(PaymentStatus.PROCESSING)
                .createdAt(LocalDateTime.now())
                .build();
            
            payment = paymentRepository.save(payment);
            
            // Process payment through gateway
            PaymentGateway gateway = gatewayManager.getGateway(paymentMethod.getType());
            GatewayResponse gatewayResponse = gateway.processPayment(
                PaymentRequest.builder()
                    .paymentId(payment.getPaymentId())
                    .amount(amount)
                    .currency("USD")
                    .paymentMethod(paymentMethod)
                    .build()
            );
            
            // Update payment with gateway response
            payment.setTransactionId(gatewayResponse.getTransactionId());
            payment.setGatewayResponse(gatewayResponse.getRawResponse());
            payment.setPaymentStatus(mapGatewayStatus(gatewayResponse.getStatus()));
            payment.setUpdatedAt(LocalDateTime.now());
            
            payment = paymentRepository.save(payment);
            
            // Handle payment result
            if (payment.getPaymentStatus() == PaymentStatus.COMPLETED) {
                eventPublisher.publishEvent(new PaymentSuccessEvent(payment));
            } else if (payment.getPaymentStatus() == PaymentStatus.FAILED) {
                eventPublisher.publishEvent(new PaymentFailedEvent(payment));
            }
            
            return PaymentResult.builder()
                .paymentId(payment.getPaymentId())
                .status(payment.getPaymentStatus())
                .transactionId(payment.getTransactionId())
                .amount(payment.getAmount())
                .build();
            
        } catch (Exception e) {
            // Log payment error
            auditLogger.logPaymentError(orderId, amount, e.getMessage());
            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }
    
    @Async
    public void handlePaymentWebhook(String gatewayName, String payload, String signature) {
        try {
            // Verify webhook signature
            PaymentGateway gateway = gatewayManager.getGateway(gatewayName);
            if (!gateway.verifyWebhookSignature(payload, signature)) {
                throw new InvalidWebhookSignatureException("Invalid webhook signature");
            }
            
            // Parse webhook payload
            WebhookEvent webhookEvent = gateway.parseWebhookPayload(payload);
            
            // Find corresponding payment
            Payment payment = paymentRepository.findByTransactionId(webhookEvent.getTransactionId())
                .orElseThrow(() -> new PaymentNotFoundException("Payment not found for transaction"));
            
            // Update payment status
            PaymentStatus newStatus = mapWebhookStatus(webhookEvent.getStatus());
            if (payment.getPaymentStatus() != newStatus) {
                PaymentStatus previousStatus = payment.getPaymentStatus();
                payment.setPaymentStatus(newStatus);
                payment.setUpdatedAt(LocalDateTime.now());
                paymentRepository.save(payment);
                
                // Publish status change event
                eventPublisher.publishEvent(
                    new PaymentStatusChangedEvent(payment, previousStatus, newStatus)
                );
            }
            
        } catch (Exception e) {
            auditLogger.logWebhookError(gatewayName, payload, e.getMessage());
            throw e;
        }
    }
    
    public RefundResult processRefund(String paymentId, BigDecimal refundAmount, String reason) {
        Payment payment = paymentRepository.findById(paymentId)
            .orElseThrow(() -> new PaymentNotFoundException("Payment not found"));
        
        // Validate refund eligibility
        validateRefundEligibility(payment, refundAmount);
        
        // Create refund record
        Refund refund = Refund.builder()
            .refundId(UUID.randomUUID().toString())
            .paymentId(paymentId)
            .orderId(payment.getOrderId())
            .refundAmount(refundAmount)
            .reason(reason)
            .refundStatus(RefundStatus.PROCESSING)
            .createdAt(LocalDateTime.now())
            .build();
        
        refund = refundRepository.save(refund);
        
        try {
            // Process refund through gateway
            PaymentGateway gateway = gatewayManager.getGateway(payment.getPaymentMethod());
            GatewayResponse gatewayResponse = gateway.processRefund(
                RefundRequest.builder()
                    .refundId(refund.getRefundId())
                    .transactionId(payment.getTransactionId())
                    .amount(refundAmount)
                    .reason(reason)
                    .build()
            );
            
            // Update refund with gateway response
            refund.setRefundStatus(mapGatewayRefundStatus(gatewayResponse.getStatus()));
            refund.setProcessedAt(LocalDateTime.now());
            refund = refundRepository.save(refund);
            
            // Publish refund event
            eventPublisher.publishEvent(new RefundProcessedEvent(refund));
            
            return RefundResult.builder()
                .refundId(refund.getRefundId())
                .status(refund.getRefundStatus())
                .amount(refund.getRefundAmount())
                .build();
                
        } catch (Exception e) {
            refund.setRefundStatus(RefundStatus.FAILED);
            refundRepository.save(refund);
            throw new RefundProcessingException("Refund processing failed", e);
        }
    }
}
```

### 2.5 Shopping Cart Service

#### 2.5.1 Component Architecture
```
CartController
├── CartService
│   ├── CartSessionManager
│   ├── CartPersistenceService
│   └── CartValidationService
├── CartRepository
├── CartItemRepository
└── Redis Cache
```

#### 2.5.2 Class Specifications

**CartService**
```java
@Service
@Transactional
public class CartService {
    
    @Autowired
    private CartRepository cartRepository;
    
    @Autowired
    private CartItemRepository cartItemRepository;
    
    @Autowired
    private ProductService productService;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Autowired
    private CartValidationService validationService;
    
    private static final String CART_CACHE_KEY_PREFIX = "cart:";
    private static final int CART_CACHE_TTL = 3600; // 1 hour
    
    public CartDto addItemToCart(String userId, AddCartItemRequest request) {
        // Validate product exists and is available
        ProductDto product = productService.getProductById(request.getProductId());
        if (!product.isActive()) {
            throw new ProductNotAvailableException("Product is not available");
        }
        
        // Validate quantity
        if (request.getQuantity() <= 0) {
            throw new InvalidQuantityException("Quantity must be greater than 0");
        }
        
        // Get or create cart
        Cart cart = getOrCreateCart(userId);
        
        // Check if item already exists in cart
        Optional<CartItem> existingItem = cart.getItems().stream()
            .filter(item -> item.getProductId().equals(request.getProductId()))
            .findFirst();
        
        if (existingItem.isPresent()) {
            // Update existing item quantity
            CartItem item = existingItem.get();
            int newQuantity = item.getQuantity() + request.getQuantity();
            
            // Validate inventory availability
            validationService.validateInventoryAvailability(request.getProductId(), newQuantity);
            
            item.setQuantity(newQuantity);
            item.setTotalPrice(product.getPrice().multiply(BigDecimal.valueOf(newQuantity)));
            item.setUpdatedAt(LocalDateTime.now());
            
            cartItemRepository.save(item);
        } else {
            // Validate inventory availability
            validationService.validateInventoryAvailability(request.getProductId(), request.getQuantity());
            
            // Create new cart item
            CartItem newItem = CartItem.builder()
                .cartItemId(UUID.randomUUID().toString())
                .cartId(cart.getCartId())
                .productId(request.getProductId())
                .quantity(request.getQuantity())
                .unitPrice(product.getPrice())
                .totalPrice(product.getPrice().multiply(BigDecimal.valueOf(request.getQuantity())))
                .addedAt(LocalDateTime.now())
                .build();
            
            cartItemRepository.save(newItem);
            cart.getItems().add(newItem);
        }
        
        // Update cart totals
        updateCartTotals(cart);
        cart.setUpdatedAt(LocalDateTime.now());
        cart = cartRepository.save(cart);
        
        // Update cache
        updateCartCache(userId, cart);
        
        return CartDto.from(cart);
    }
    
    public CartDto updateCartItem(String userId, String cartItemId, UpdateCartItemRequest request) {
        Cart cart = getCartByUserId(userId);
        
        CartItem cartItem = cart.getItems().stream()
            .filter(item -> item.getCartItemId().equals(cartItemId))
            .findFirst()
            .orElseThrow(() -> new CartItemNotFoundException("Cart item not found"));
        
        if (request.getQuantity() <= 0) {
            throw new InvalidQuantityException("Quantity must be greater than 0");
        }
        
        // Validate inventory availability
        validationService.validateInventoryAvailability(
            cartItem.getProductId(), 
            request.getQuantity()
        );
        
        // Update cart item
        cartItem.setQuantity(request.getQuantity());
        cartItem.setTotalPrice(
            cartItem.getUnitPrice().multiply(BigDecimal.valueOf(request.getQuantity()))
        );
        cartItem.setUpdatedAt(LocalDateTime.now());
        
        cartItemRepository.save(cartItem);
        
        // Update cart totals
        updateCartTotals(cart);
        cart.setUpdatedAt(LocalDateTime.now());
        cart = cartRepository.save(cart);
        
        // Update cache
        updateCartCache(userId, cart);
        
        return CartDto.from(cart);
    }
    
    public CartDto removeCartItem(String userId, String cartItemId) {
        Cart cart = getCartByUserId(userId);
        
        CartItem cartItem = cart.getItems().stream()
            .filter(item -> item.getCartItemId().equals(cartItemId))
            .findFirst()
            .orElseThrow(() -> new CartItemNotFoundException("Cart item not found"));
        
        // Remove item
        cart.getItems().remove(cartItem);
        cartItemRepository.delete(cartItem);
        
        // Update cart totals
        updateCartTotals(cart);
        cart.setUpdatedAt(LocalDateTime.now());
        cart = cartRepository.save(cart);
        
        // Update cache
        updateCartCache(userId, cart);
        
        return CartDto.from(cart);
    }
    
    public CartDto getCartByUserId(String userId) {
        // Try to get from cache first
        String cacheKey = CART_CACHE_KEY_PREFIX + userId;
        CartDto cachedCart = (CartDto) redisTemplate.opsForValue().get(cacheKey);
        
        if (cachedCart != null) {
            return cachedCart;
        }
        
        // Get from database
        Cart cart = cartRepository.findByUserIdAndIsActive(userId, true)
            .orElse(null);
        
        if (cart == null) {
            return CartDto.empty(userId);
        }
        
        // Load cart items
        List<CartItem> items = cartItemRepository.findByCartId(cart.getCartId());
        cart.setItems(items);
        
        CartDto cartDto = CartDto.from(cart);
        
        // Cache the result
        redisTemplate.opsForValue().set(cacheKey, cartDto, CART_CACHE_TTL, TimeUnit.SECONDS);
        
        return cartDto;
    }
    
    public void clearCart(String userId) {
        Cart cart = cartRepository.findByUserIdAndIsActive(userId, true)
            .orElse(null);
        
        if (cart != null) {
            // Delete all cart items
            cartItemRepository.deleteByCartId(cart.getCartId());
            
            // Mark cart as inactive
            cart.setIsActive(false);
            cart.setUpdatedAt(LocalDateTime.now());
            cartRepository.save(cart);
            
            // Remove from cache
            String cacheKey = CART_CACHE_KEY_PREFIX + userId;
            redisTemplate.delete(cacheKey);
        }
    }
    
    private Cart getOrCreateCart(String userId) {
        return cartRepository.findByUserIdAndIsActive(userId, true)
            .orElseGet(() -> {
                Cart newCart = Cart.builder()
                    .cartId(UUID.randomUUID().toString())
                    .userId(userId)
                    .isActive(true)
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .items(new ArrayList<>())
                    .build();
                return cartRepository.save(newCart);
            });
    }
    
    private void updateCartTotals(Cart cart) {
        BigDecimal totalAmount = cart.getItems().stream()
            .map(CartItem::getTotalPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        cart.setTotalAmount(totalAmount);
        cart.setItemCount(cart.getItems().size());
    }
    
    private void updateCartCache(String userId, Cart cart) {
        String cacheKey = CART_CACHE_KEY_PREFIX + userId;
        CartDto cartDto = CartDto.from(cart);
        redisTemplate.opsForValue().set(cacheKey, cartDto, CART_CACHE_TTL, TimeUnit.SECONDS);
    }
}
```

## 3. Data Flow Diagrams

### 3.1 User Authentication Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │Auth Service │    │  Database   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
        │                   │                   │                   │
        │ POST /auth/login  │                   │                   │
        ├──────────────────►│                   │                   │
        │                   │ Validate Request  │                   │
        │                   ├──────────────────►│                   │
        │                   │                   │ Query User        │
        │                   │                   ├──────────────────►│
        │                   │                   │ User Data         │
        │                   │                   │◄──────────────────┤
        │                   │                   │ Verify Password   │
        │                   │                   │ Generate JWT      │
        │                   │                   │ Create Session    │
        │                   │ JWT Token         │                   │
        │                   │◄──────────────────┤                   │
        │ 200 OK + Token    │                   │                   │
        │◄──────────────────┤                   │                   │
```

### 3.2 Product Search Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │Product Svc  │    │Elasticsearch│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
        │                   │                   │                   │
        │ GET /products/    │                   │                   │
        │     search?q=...  │                   │                   │
        ├──────────────────►│                   │                   │
        │                   │ Validate & Route  │                   │
        │                   ├──────────────────►│                   │
        │                   │                   │ Search Query      │
        │                   │                   ├──────────────────►│
        │                   │                   │ Search Results    │
        │                   │                   │◄──────────────────┤
        │                   │                   │ Enrich with       │
        │                   │                   │ Product Details   │
        │                   │ Product List      │                   │
        │                   │◄──────────────────┤                   │
        │ 200 OK + Results  │                   │                   │
        │◄──────────────────┤                   │                   │
```

### 3.3 Order Processing Flow
```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Client  │  │   API   │  │ Order   │  │Payment  │  │Inventory│  │Notification│
│         │  │Gateway  │  │Service  │  │Service  │  │Service  │  │  Service   │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
     │            │            │            │            │            │
     │POST /orders│            │            │            │            │
     ├───────────►│            │            │            │            │
     │            │Validate    │            │            │            │
     │            ├───────────►│            │            │            │
     │            │            │Reserve     │            │            │
     │            │            │Inventory   │            │            │
     │            │            ├───────────────────────►│            │
     │            │            │            │            │ OK         │
     │            │            │◄───────────────────────┤            │
     │            │            │Process     │            │            │
     │            │            │Payment     │            │            │
     │            │            ├───────────►│            │            │
     │            │            │            │ Success    │            │
     │            │            │◄───────────┤            │            │
     │            │            │Send Order  │            │            │
     │            │            │Confirmation│            │            │
     │            │            ├───────────────────────────────────►│
     │            │Order       │            │            │            │
     │            │Created     │            │            │            │
     │            │◄───────────┤            │            │            │
     │200 OK      │            │            │            │            │
     │◄───────────┤            │            │            │            │
```

## 4. Sequence Diagrams

### 4.1 User Registration Sequence
```
User -> WebApp: Fill registration form
WebApp -> API_Gateway: POST /auth/register
API_Gateway -> Auth_Service: Validate and create user
Auth_Service -> Database: Check email uniqueness
Database -> Auth_Service: Email available
Auth_Service -> Password_Manager: Hash password
Password_Manager -> Auth_Service: Hashed password
Auth_Service -> Database: Save user
Database -> Auth_Service: User saved
Auth_Service -> Email_Service: Send verification email
Email_Service -> User: Verification email
Auth_Service -> API_Gateway: Registration success
API_Gateway -> WebApp: 201 Created
WebApp -> User: Registration successful message
```

### 4.2 Product Purchase Sequence
```
User -> WebApp: Add product to cart
WebApp -> API_Gateway: POST /cart/items
API_Gateway -> Cart_Service: Add item to cart
Cart_Service -> Product_Service: Validate product
Product_Service -> Cart_Service: Product valid
Cart_Service -> Inventory_Service: Check availability
Inventory_Service -> Cart_Service: Stock available
Cart_Service -> Database: Save cart item
Database -> Cart_Service: Item saved
Cart_Service -> Cache: Update cart cache
Cart_Service -> API_Gateway: Item added
API_Gateway -> WebApp: 200 OK
WebApp -> User: Item added to cart

User -> WebApp: Proceed to checkout
WebApp -> API_Gateway: POST /orders
API_Gateway -> Order_Service: Create order
Order_Service -> Cart_Service: Get cart items
Cart_Service -> Order_Service: Cart items
Order_Service -> Inventory_Service: Reserve inventory
Inventory_Service -> Order_Service: Inventory reserved
Order_Service -> Payment_Service: Process payment
Payment_Service -> Payment_Gateway: Charge payment
Payment_Gateway -> Payment_Service: Payment successful
Payment_Service -> Order_Service: Payment confirmed
Order_Service -> Database: Save order
Database -> Order_Service: Order saved
Order_Service -> Notification_Service: Send confirmation
Notification_Service -> User: Order confirmation email
Order_Service -> API_Gateway: Order created
API_Gateway -> WebApp: 201 Created
WebApp -> User: Order successful
```

## 5. Database Schema Design

### 5.1 Core Tables

**Users Table**
```sql
CREATE TABLE users (
    user_id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    mfa_enabled BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_active (is_active),
    INDEX idx_created_at (created_at)
);
```

**Products Table**
```sql
CREATE TABLE products (
    product_id VARCHAR(36) PRIMARY KEY,
    seller_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    sku VARCHAR(100) UNIQUE NOT NULL,
    images JSON,
    specifications JSON,
    weight DECIMAL(8,2),
    dimensions VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    INDEX idx_seller (seller_id),
    INDEX idx_category (category_id),
    INDEX idx_active (is_active),
    INDEX idx_price (price),
    INDEX idx_created_at (created_at),
    FULLTEXT idx_search (product_name, description)
);
```

**Orders Table**
```sql
CREATE TABLE orders (
    order_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_status ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    payment_status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED') DEFAULT 'PENDING',
    shipping_address JSON NOT NULL,
    billing_address JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user (user_id),
    INDEX idx_status (order_status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created_at (created_at)
);
```

**Payments Table**
```sql
CREATE TABLE payments (
    payment_id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    payment_method ENUM('CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    transaction_id VARCHAR(255),
    payment_status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
    gateway_response JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    INDEX idx_order (order_id),
    INDEX idx_transaction (transaction_id),
    INDEX idx_status (payment_status),
    INDEX idx_created_at (created_at)
);
```

### 5.2 Indexing Strategy

**Performance Indexes**
```sql
-- Composite indexes for common queries
CREATE INDEX idx_products_seller_category ON products(seller_id, category_id, is_active);
CREATE INDEX idx_orders_user_status ON orders(user_id, order_status, created_at DESC);
CREATE INDEX idx_payments_order_status ON payments(order_id, payment_status);

-- Search optimization indexes
CREATE INDEX idx_products_price_range ON products(price, is_active);
CREATE INDEX idx_products_category_price ON products(category_id, price, is_active);

-- Audit and reporting indexes
CREATE INDEX idx_orders_date_status ON orders(created_at, order_status);
CREATE INDEX idx_payments_date_amount ON payments(created_at, amount);
```

## 6. API Specifications

### 6.1 Authentication APIs

**POST /api/v1/auth/login**
```json
{
  "summary": "User login",
  "requestBody": {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "rememberMe": true
  },
  "responses": {
    "200": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresIn": 900,
      "user": {
        "userId": "123e4567-e89b-12d3-a456-426614174000",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "roles": ["USER"]
      }
    },
    "401": {
      "error": "INVALID_CREDENTIALS",
      "message": "Invalid email or password"
    },
    "429": {
      "error": "RATE_LIMIT_EXCEEDED",
      "message": "Too many login attempts. Please try again later."
    }
  }
}
```

**POST /api/v1/auth/register**
```json
{
  "summary": "User registration",
  "requestBody": {
    "email": "newuser@example.com",
    "password": "SecurePassword123!",
    "firstName": "Jane",
    "lastName": "Smith",
    "phoneNumber": "+1234567890"
  },
  "responses": {
    "201": {
      "message": "Registration successful. Please verify your email.",
      "user": {
        "userId": "123e4567-e89b-12d3-a456-426614174001",
        "email": "newuser@example.com",
        "firstName": "Jane",
        "lastName": "Smith",
        "isActive": false,
        "emailVerified": false
      }
    },
    "400": {
      "error": "VALIDATION_ERROR",
      "message": "Invalid input data",
      "details": [
        {
          "field": "email",
          "message": "Email format is invalid"
        }
      ]
    },
    "409": {
      "error": "EMAIL_ALREADY_EXISTS",
      "message": "Email is already registered"
    }
  }
}
```

### 6.2 Product APIs

**GET /api/v1/products**
```json
{
  "summary": "Get products with filtering and pagination",
  "parameters": {
    "page": 0,
    "size": 20,
    "sort": "createdAt,desc",
    "category": "electronics",
    "seller": "seller123",
    "inStock": true,
    "minPrice": 10.00,
    "maxPrice": 1000.00
  },
  "responses": {
    "200": {
      "content": [
        {
          "productId": "prod123",
          "productName": "Smartphone XYZ",
          "description": "Latest smartphone with advanced features",
          "price": 599.99,
          "images": [
            "https://cdn.example.com/images/prod123_1.jpg"
          ],
          "seller": {
            "sellerId": "seller123",
            "businessName": "Tech Store"
          },
          "category": {
            "categoryId": "cat123",
            "categoryName": "Electronics"
          },
          "inStock": true,
          "rating": 4.5,
          "reviewCount": 128
        }
      ],
      "page": 0,
      "size": 20,
      "totalElements": 150,
      "totalPages": 8,
      "first": true,
      "last": false
    }
  }
}
```

**POST /api/v1/products**
```json
{
  "summary": "Create new product (Seller/Admin only)",
  "security": ["bearerAuth"],
  "requestBody": {
    "productName": "New Product",
    "description": "Product description",
    "categoryId": "cat123",
    "price": 299.99,
    "initialStock": 100,
    "specifications": {
      "brand": "BrandName",
      "model": "Model123",
      "warranty": "2 years"
    },
    "weight": 1.5,
    "dimensions": "10x5x2 inches",
    "images": [
      "base64encodedimage1",
      "base64encodedimage2"
    ]
  },
  "responses": {
    "201": {
      "productId": "prod456",
      "productName": "New Product",
      "sku": "SEL-NEWPRO-123456",
      "price": 299.99,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "403": {
      "error": "INSUFFICIENT_PERMISSIONS",
      "message": "Only sellers and admins can create products"
    }
  }
}
```

### 6.3 Order APIs

**POST /api/v1/orders**
```json
{
  "summary": "Create new order",
  "security": ["bearerAuth"],
  "requestBody": {
    "shippingAddress": {
      "firstName": "John",
      "lastName": "Doe",
      "addressLine1": "123 Main St",
      "addressLine2": "Apt 4B",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US",
      "phoneNumber": "+1234567890"
    },
    "billingAddress": {
      "firstName": "John",
      "lastName": "Doe",
      "addressLine1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US"
    },
    "paymentMethod": {
      "type": "CREDIT_CARD",
      "cardToken": "card_token_123",
      "saveCard": true
    }
  },
  "responses": {
    "201": {
      "orderId": "ord789",
      "orderNumber": "ORD-20240115-000123",
      "orderStatus": "PENDING",
      "totalAmount": 659.97,
      "taxAmount": 52.80,
      "shippingAmount": 7.18,
      "items": [
        {
          "orderItemId": "item123",
          "productId": "prod123",
          "productName": "Smartphone XYZ",
          "quantity": 1,
          "unitPrice": 599.99,
          "totalPrice": 599.99
        }
      ],
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "400": {
      "error": "EMPTY_CART",
      "message": "Cannot create order from empty cart"
    },
    "402": {
      "error": "PAYMENT_FAILED",
      "message": "Payment processing failed"
    }
  }
}
```

## 7. Security Implementation

### 7.1 Authentication & Authorization

**JWT Token Structure**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user123",
    "email": "user@example.com",
    "roles": ["USER", "SELLER"],
    "permissions": [
      "product:read",
      "product:create",
      "order:read",
      "order:create"
    ],
    "iat": 1642248000,
    "exp": 1642248900,
    "iss": "ecommerce-platform"
  }
}
```

**Security Filter Chain**
```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> 
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/products/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/seller/**").hasAnyRole("SELLER", "ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtDecoder(jwtDecoder()))
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(authenticationEntryPoint())
                .accessDeniedHandler(accessDeniedHandler())
            )
            .addFilterBefore(rateLimitingFilter(), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(requestValidationFilter(), JwtAuthenticationFilter.class)
            .build();
    }
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }
    
    @Bean
    public JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withSecretKey(getSecretKey())
            .macAlgorithm(MacAlgorithm.HS256)
            .build();
    }
}
```

### 7.2 Input Validation & Sanitization

**Request Validation**
```java
@Component
public class RequestValidationFilter implements Filter {
    
    private final ObjectMapper objectMapper;
    private final JsonSchemaValidator schemaValidator;
    
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, 
                        FilterChain chain) throws IOException, ServletException {
        
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        
        try {
            // Validate request size
            if (httpRequest.getContentLengthLong() > MAX_REQUEST_SIZE) {
                throw new RequestTooLargeException("Request size exceeds limit");
            }
            
            // Validate content type
            String contentType = httpRequest.getContentType();
            if (!isValidContentType(contentType)) {
                throw new UnsupportedMediaTypeException("Invalid content type");
            }
            
            // Validate headers
            validateHeaders(httpRequest);
            
            // For POST/PUT requests, validate JSON schema
            if (isJsonRequest(httpRequest)) {
                String requestBody = getRequestBody(httpRequest);
                validateJsonSchema(httpRequest.getRequestURI(), requestBody);
                
                // Sanitize input
                String sanitizedBody = sanitizeInput(requestBody);
                httpRequest = new CachedBodyHttpServletRequest(httpRequest, sanitizedBody);
            }
            
            chain.doFilter(httpRequest, httpResponse);
            
        } catch (ValidationException e) {
            handleValidationError(httpResponse, e);
        }
    }
    
    private void validateJsonSchema(String endpoint, String requestBody) {
        JsonSchema schema = schemaValidator.getSchemaForEndpoint(endpoint);
        if (schema != null) {
            Set<ValidationMessage> errors = schema.validate(objectMapper.readTree(requestBody));
            if (!errors.isEmpty()) {
                throw new JsonSchemaValidationException("Invalid request format", errors);
            }
        }
    }
    
    private String sanitizeInput(String input) {
        return Jsoup.clean(input, Safelist.none())
            .replaceAll("[<>\"'%;()&+]", "");
    }
}
```

### 7.3 Encryption Implementation

**Field-Level Encryption**
```java
@Component
public class FieldEncryptionService {
    
    private final AESUtil aesUtil;
    
    @Value("${encryption.key}")
    private String encryptionKey;
    
    public String encryptSensitiveData(String plainText) {
        if (StringUtils.isBlank(plainText)) {
            return plainText;
        }
        
        try {
            return aesUtil.encrypt(plainText, encryptionKey);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt sensitive data", e);
        }
    }
    
    public String decryptSensitiveData(String encryptedText) {
        if (StringUtils.isBlank(encryptedText)) {
            return encryptedText;
        }
        
        try {
            return aesUtil.decrypt(encryptedText, encryptionKey);
        } catch (Exception e) {
            throw new DecryptionException("Failed to decrypt sensitive data", e);
        }
    }
}

@Component
public class AESUtil {
    
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 16;
    
    public String encrypt(String plainText, String key) throws Exception {
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(), "AES");
        
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        byte[] iv = new byte[GCM_IV_LENGTH];
        SecureRandom.getInstanceStrong().nextBytes(iv);
        
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, parameterSpec);
        
        byte[] encryptedData = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        
        ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + encryptedData.length);
        byteBuffer.put(iv);
        byteBuffer.put(encryptedData);
        
        return Base64.getEncoder().encodeToString(byteBuffer.array());
    }
    
    public String decrypt(String encryptedText, String key) throws Exception {
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(), "AES");
        
        byte[] decodedData = Base64.getDecoder().decode(encryptedText);
        ByteBuffer byteBuffer = ByteBuffer.wrap(decodedData);
        
        byte[] iv = new byte[GCM_IV_LENGTH];
        byteBuffer.get(iv);
        
        byte[] encryptedData = new byte[byteBuffer.remaining()];
        byteBuffer.get(encryptedData);
        
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);
        
        byte[] decryptedData = cipher.doFinal(encryptedData);
        return new String(decryptedData, StandardCharsets.UTF_8);
    }
}
```

## 8. Performance Optimization

### 8.1 Caching Strategy

**Multi-Level Caching Implementation**
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager() {
        RedisCacheManager.Builder builder = RedisCacheManager
            .RedisCacheManagerBuilder
            .fromConnectionFactory(redisConnectionFactory())
            .cacheDefaults(cacheConfiguration());
        
        return builder.build();
    }
    
    private RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(60))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }
}

@Service
public class ProductCacheService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final String PRODUCT_CACHE_PREFIX = "product:";
    private static final String PRODUCT_LIST_CACHE_PREFIX = "products:";
    private static final int CACHE_TTL_SECONDS = 3600; // 1 hour
    
    @Cacheable(value = "products", key = "#productId")
    public ProductDto getProduct(String productId) {
        // This will be cached automatically by Spring Cache
        return productService.getProductById(productId);
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public void evictProduct(String productId) {
        // Remove from cache when product is updated
    }
    
    @Caching(evict = {
        @CacheEvict(value = "products", allEntries = true),
        @CacheEvict(value = "product-lists", allEntries = true)
    })
    public void evictAllProductCaches() {
        // Clear all product-related caches
    }
    
    public void cachePopularProducts() {
        // Pre-warm cache with popular products
        List<String> popularProductIds = analyticsService.getPopularProductIds(100);
        
        popularProductIds.parallelStream().forEach(productId -> {
            try {
                ProductDto product = productService.getProductById(productId);
                String cacheKey = PRODUCT_CACHE_PREFIX + productId;
                redisTemplate.opsForValue().set(cacheKey, product, CACHE_TTL_SECONDS, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("Failed to cache product: {}", productId, e);
            }
        });
    }
}
```

### 8.2 Database Optimization

**Connection Pool Configuration**
```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000
      max-lifetime: 1200000
      connection-timeout: 20000
      validation-timeout: 5000
      leak-detection-threshold: 60000
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        jdbc:
          batch_size: 25
          order_inserts: true
          order_updates: true
        cache:
          use_second_level_cache: true
          use_query_cache: true
          region.factory_class: org.hibernate.cache.jcache.JCacheRegionFactory
```

**Query Optimization**
```java
@Repository
public class ProductRepositoryImpl {
    
    @PersistenceContext
    private EntityManager entityManager;
    
    public Page<Product> findProductsOptimized(ProductFilter filter, Pageable pageable) {
        // Use native query for complex filtering
        StringBuilder queryBuilder = new StringBuilder(
            "SELECT p.*, c.category_name, u.business_name as seller_name " +
            "FROM products p " +
            "JOIN categories c ON p.category_id = c.category_id " +
            "JOIN users u ON p.seller_id = u.user_id " +
            "WHERE p.is_active = true"
        );
        
        Map<String, Object> parameters = new HashMap<>();
        
        if (filter.getCategoryId() != null) {
            queryBuilder.append(" AND p.category_id = :categoryId");
            parameters.put("categoryId", filter.getCategoryId());
        }
        
        if (filter.getMinPrice() != null) {
            queryBuilder.append(" AND p.price >= :minPrice");
            parameters.put("minPrice", filter.getMinPrice());
        }
        
        if (filter.getMaxPrice() != null) {
            queryBuilder.append(" AND p.price <= :maxPrice");
            parameters.put("maxPrice", filter.getMaxPrice());
        }
        
        if (filter.getInStock() != null && filter.getInStock()) {
            queryBuilder.append(" AND p.stock_quantity > 0");
        }
        
        // Add sorting
        String sortField = pageable.getSort().iterator().next().getProperty();
        String sortDirection = pageable.getSort().iterator().next().getDirection().name();
        queryBuilder.append(" ORDER BY p.").append(sortField).append(" ").append(sortDirection);
        
        Query query = entityManager.createNativeQuery(queryBuilder.toString(), Product.class);
        parameters.forEach(query::setParameter);
        
        // Set pagination
        query.setFirstResult((int) pageable.getOffset());
        query.setMaxResults(pageable.getPageSize());
        
        List<Product> products = query.getResultList();
        
        // Get total count
        String countQuery = queryBuilder.toString().replaceFirst(
            "SELECT p.*, c.category_name, u.business_name as seller_name", 
            "SELECT COUNT(*)"
        ).replaceFirst(" ORDER BY.*", "");
        
        Query totalQuery = entityManager.createNativeQuery(countQuery);
        parameters.forEach(totalQuery::setParameter);
        long total = ((Number) totalQuery.getSingleResult()).longValue();
        
        return new PageImpl<>(products, pageable, total);
    }
    
    @Query(value = "SELECT * FROM products p WHERE MATCH(p.product_name, p.description) AGAINST(?1 IN NATURAL LANGUAGE MODE) AND p.is_active = true", nativeQuery = true)
    List<Product> findByFullTextSearch(String searchTerm);
    
    @Modifying
    @Query("UPDATE Product p SET p.stockQuantity = p.stockQuantity - :quantity WHERE p.productId = :productId AND p.stockQuantity >= :quantity")
    int decrementStock(@Param("productId") String productId, @Param("quantity") int quantity);
}
```

### 8.3 Async Processing

**Async Configuration**
```java
@Configuration
@EnableAsync
public class AsyncConfig {
    
    @Bean(name = "taskExecutor")
    public TaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("async-task-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
    
    @Bean(name = "emailExecutor")
    public TaskExecutor emailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("email-task-");
        executor.initialize();
        return executor;
    }
}

@Service
public class NotificationService {
    
    @Async("emailExecutor")
    public CompletableFuture<Void> sendOrderConfirmationAsync(Order order) {
        try {
            EmailTemplate template = emailTemplateService.getTemplate("ORDER_CONFIRMATION");
            
            Map<String, Object> templateData = Map.of(
                "orderNumber", order.getOrderNumber(),
                "customerName", order.getUser().getFirstName(),
                "totalAmount", order.getTotalAmount(),
                "items", order.getItems()
            );
            
            String emailContent = templateEngine.process(template.getContent(), templateData);
            
            emailService.sendEmail(
                order.getUser().getEmail(),
                template.getSubject(),
                emailContent
            );
            
            auditLogger.logEmailSent(order.getUserId(), "ORDER_CONFIRMATION");
            
        } catch (Exception e) {
            log.error("Failed to send order confirmation email for order: {}", order.getOrderId(), e);
            throw new EmailSendingException("Failed to send order confirmation", e);
        }
        
        return CompletableFuture.completedFuture(null);
    }
    
    @Async("taskExecutor")
    public CompletableFuture<Void> processInventoryUpdateAsync(String productId, int quantityChange) {
        try {
            inventoryService.updateInventory(productId, quantityChange);
            
            // Update search index
            Product product = productService.getProductById(productId);
            elasticsearchService.updateProductIndex(product);
            
            // Invalidate cache
            cacheService.evictProduct(productId);
            
        } catch (Exception e) {
            log.error("Failed to process inventory update for product: {}", productId, e);
            throw new InventoryUpdateException("Failed to update inventory", e);
        }
        
        return CompletableFuture.completedFuture(null);
    }
}
```

## 9. Error Handling & Monitoring

### 9.1 Global Exception Handler

```java
@ControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    
    @Autowired
    private MessageSource messageSource;
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        log.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .error("VALIDATION_ERROR")
            .message(ex.getMessage())
            .timestamp(LocalDateTime.now())
            .details(ex.getValidationErrors())
            .build();
            
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleEntityNotFoundException(EntityNotFoundException ex) {
        log.warn("Entity not found: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .error("ENTITY_NOT_FOUND")
            .message(ex.getMessage())
            .timestamp(LocalDateTime.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException ex) {
        log.warn("Access denied: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .error("ACCESS_DENIED")
            .message("You don't have permission to access this resource")
            .timestamp(LocalDateTime.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentProcessingException(PaymentProcessingException ex) {
        log.error("Payment processing error: {}", ex.getMessage(), ex);
        
        ErrorResponse error = ErrorResponse.builder()
            .error("PAYMENT_PROCESSING_ERROR")
            .message("Payment could not be processed. Please try again.")
            .timestamp(LocalDateTime.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ErrorResponse> handleRateLimitExceededException(RateLimitExceededException ex) {
        log.warn("Rate limit exceeded: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .error("RATE_LIMIT_EXCEEDED")
            .message("Too many requests. Please try again later.")
            .timestamp(LocalDateTime.now())
            .retryAfter(ex.getRetryAfter())
            .build();
            
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", String.valueOf(ex.getRetryAfter()))
            .body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        log.error("Unexpected error occurred: {}", ex.getMessage(), ex);
        
        ErrorResponse error = ErrorResponse.builder()
            .error("INTERNAL_SERVER_ERROR")
            .message("An unexpected error occurred. Please try again later.")
            .timestamp(LocalDateTime.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

### 9.2 Monitoring & Metrics

**Prometheus Metrics Configuration**
```java
@Configuration
public class MetricsConfig {
    
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
    
    @Bean
    public CountedAspect countedAspect(MeterRegistry registry) {
        return new CountedAspect(registry);
    }
    
    @Bean
    public MeterRegistryCustomizer<MeterRegistry> metricsCommonTags() {
        return registry -> registry.config().commonTags(
            "application", "ecommerce-platform",
            "environment", environment.getActiveProfiles()[0]
        );
    }
}

@Component
public class CustomMetrics {
    
    private final Counter orderCreatedCounter;
    private final Counter paymentProcessedCounter;
    private final Timer orderProcessingTimer;
    private final Gauge activeUsersGauge;
    
    public CustomMetrics(MeterRegistry meterRegistry) {
        this.orderCreatedCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
            
        this.paymentProcessedCounter = Counter.builder("payments.processed")
            .description("Number of payments processed")
            .tag("status", "success")
            .register(meterRegistry);
            
        this.orderProcessingTimer = Timer.builder("order.processing.time")
            .description("Time taken to process an order")
            .register(meterRegistry);
            
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .register(meterRegistry, this, CustomMetrics::getActiveUserCount);
    }
    
    public void incrementOrderCreated() {
        orderCreatedCounter.increment();
    }
    
    public void recordOrderProcessingTime(Duration duration) {
        orderProcessingTimer.record(duration);
    }
    
    private double getActiveUserCount() {
        return userService.getActiveUserCount();
    }
}
```

### 9.3 Health Checks

```java
@Component
public class DatabaseHealthIndicator implements HealthIndicator {
    
    @Autowired
    private DataSource dataSource;
    
    @Override
    public Health health() {
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(1)) {
                return Health.up()
                    .withDetail("database", "Available")
                    .withDetail("validationQuery", "SELECT 1")
                    .build();
            } else {
                return Health.down()
                    .withDetail("database", "Connection invalid")
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withDetail("database", "Connection failed")
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}

@Component
public class RedisHealthIndicator implements HealthIndicator {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Override
    public Health health() {
        try {
            String result = redisTemplate.getConnectionFactory()
                .getConnection()
                .ping();
                
            if ("PONG".equals(result)) {
                return Health.up()
                    .withDetail("redis", "Available")
                    .build();
            } else {
                return Health.down()
                    .withDetail("redis", "Ping failed")
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withDetail("redis", "Connection failed")
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}
```

## 10. Testing Strategy

### 10.1 Unit Tests

```java
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordManager passwordManager;
    
    @Mock
    private JWTTokenManager jwtTokenManager;
    
    @Mock
    private AuditLogger auditLogger;
    
    @InjectMocks
    private AuthService authService;
    
    @Test
    void shouldAuthenticateUserWithValidCredentials() {
        // Given
        String email = "test@example.com";
        String password = "password123";
        String clientIp = "192.168.1.1";
        
        User user = User.builder()
            .userId("user123")
            .email(email)
            .passwordHash("hashedPassword")
            .isActive(true)
            .build();
            
        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(passwordManager.verifyPassword(password, user.getPasswordHash())).thenReturn(true);
        when(jwtTokenManager.generateAccessToken(user)).thenReturn("accessToken");
        when(jwtTokenManager.generateRefreshToken(user)).thenReturn("refreshToken");
        
        // When
        AuthResponse response = authService.authenticate(email, password, clientIp);
        
        // Then
        assertThat(response).isNotNull();
        assertThat(response.getAccessToken()).isEqualTo("accessToken");
        assertThat(response.getRefreshToken()).isEqualTo("refreshToken");
        assertThat(response.getUser().getEmail()).isEqualTo(email);
        
        verify(auditLogger).logSuccessfulLogin(user.getUserId(), clientIp);
        verify(userRepository).save(user);
    }
    
    @Test
    void shouldThrowExceptionForInvalidCredentials() {
        // Given
        String email = "test@example.com";
        String password = "wrongPassword";
        String clientIp = "192.168.1.1";
        
        User user = User.builder()
            .userId("user123")
            .email(email)
            .passwordHash("hashedPassword")
            .isActive(true)
            .build();
            
        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(passwordManager.verifyPassword(password, user.getPasswordHash())).thenReturn(false);
        
        // When & Then
        assertThatThrownBy(() -> authService.authenticate(email, password, clientIp))
            .isInstanceOf(InvalidCredentialsException.class)
            .hasMessage("Invalid credentials");
            
        verify(auditLogger).logFailedLogin(email, clientIp);
    }
}
```

### 10.2 Integration Tests

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(locations = "classpath:application-test.properties")
@Transactional
class OrderControllerIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private TestDataBuilder testDataBuilder;
    
    @Test
    void shouldCreateOrderSuccessfully() {
        // Given
        User user = testDataBuilder.createTestUser();
        Product product = testDataBuilder.createTestProduct();
        testDataBuilder.addProductToCart(user.getUserId(), product.getProductId(), 2);
        
        CreateOrderRequest request = CreateOrderRequest.builder()
            .shippingAddress(testDataBuilder.createTestAddress())
            .billingAddress(testDataBuilder.createTestAddress())
            .paymentMethod(testDataBuilder.createTestPaymentMethod())
            .build();
            
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(testDataBuilder.generateTestToken(user));
        HttpEntity<CreateOrderRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<OrderDto> response = restTemplate.exchange(
            "/api/v1/orders",
            HttpMethod.POST,
            entity,
            OrderDto.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getUserId()).isEqualTo(user.getUserId());
        assertThat(response.getBody().getItems()).hasSize(1);
        assertThat(response.getBody().getOrderStatus()).isEqualTo(OrderStatus.PENDING);
    }
    
    @Test
    void shouldReturn401ForUnauthenticatedRequest() {
        // Given
        CreateOrderRequest request = CreateOrderRequest.builder()
            .shippingAddress(testDataBuilder.createTestAddress())
            .billingAddress(testDataBuilder.createTestAddress())
            .paymentMethod(testDataBuilder.createTestPaymentMethod())
            .build();
            
        HttpEntity<CreateOrderRequest> entity = new HttpEntity<>(request);
        
        // When
        ResponseEntity<ErrorResponse> response = restTemplate.exchange(
            "/api/v1/orders",
            HttpMethod.POST,
            entity,
            ErrorResponse.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
```

### 10.3 Performance Tests

```java
@Component
public class PerformanceTestRunner {
    
    @Autowired
    private ProductService productService;
    
    @Test
    void productSearchPerformanceTest() {
        // Warm up
        for (int i = 0; i < 100; i++) {
            productService.searchProducts("test", PageRequest.of(0, 20));
        }
        
        // Measure performance
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        
        for (int i = 0; i < 1000; i++) {
            productService.searchProducts("electronics", PageRequest.of(0, 20));
        }
        
        stopWatch.stop();
        
        long averageTime = stopWatch.getTotalTimeMillis() / 1000;
        assertThat(averageTime).isLessThan(100); // Average should be less than 100ms
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for all major components of the e-commerce platform, including security measures, performance optimizations, error handling, and testing strategies. The design ensures scalability, maintainability, and compliance with security standards while meeting all functional requirements outlined in the HLD.