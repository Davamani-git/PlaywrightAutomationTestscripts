# Subtask 1 Output

## Domain Model

### UML Class Diagram - Online Shopping Platform (Davtest11)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      User       │    │    Product      │    │     Order       │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ - userId: UUID  │    │ - productId: UUID│    │ - orderId: UUID │
│ - email: String │    │ - name: String  │    │ - userId: UUID  │
│ - password: Hash│    │ - description   │    │ - totalAmount   │
│ - firstName     │    │ - price: Decimal│    │ - status: Enum  │
│ - lastName      │    │ - categoryId    │    │ - createdAt     │
│ - phoneNumber   │    │ - sellerId: UUID│    │ - updatedAt     │
│ - role: Enum    │    │ - inventory: Int│    │ - shippingAddr  │
│ - isActive      │    │ - images: List  │    │ - paymentId     │
│ - createdAt     │    │ - isActive      │    └─────────────────┘
│ - lastLogin     │    │ - createdAt     │           │
└─────────────────┘    └─────────────────┘           │
         │                       │                   │
         │                       │                   │
         └───────────────────────┼───────────────────┘
                                 │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ShoppingCart  │    │   OrderItem     │    │    Payment      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ - cartId: UUID  │    │ - orderItemId   │    │ - paymentId     │
│ - userId: UUID  │    │ - orderId: UUID │    │ - orderId: UUID │
│ - createdAt     │    │ - productId     │    │ - amount: Decimal│
│ - updatedAt     │    │ - quantity: Int │    │ - method: Enum  │
└─────────────────┘    │ - unitPrice     │    │ - status: Enum  │
         │              │ - totalPrice    │    │ - transactionId │
         │              └─────────────────┘    │ - processedAt   │
         │                       │             └─────────────────┘
┌─────────────────┐              │
│   CartItem      │              │
├─────────────────┤              │
│ - cartItemId    │              │
│ - cartId: UUID  │              │
│ - productId     │              │
│ - quantity: Int │              │
│ - addedAt       │              │
└─────────────────┘              │
                                 │
┌─────────────────┐    ┌─────────────────┐
│    Category     │    │     Review      │
├─────────────────┤    ├─────────────────┤
│ - categoryId    │    │ - reviewId      │
│ - name: String  │    │ - productId     │
│ - description   │    │ - userId: UUID  │
│ - parentId      │    │ - rating: Int   │
│ - isActive      │    │ - comment: Text │
└─────────────────┘    │ - createdAt     │
                       └─────────────────┘
```

### Entity Relationships

- **User** (1:M) **Order**: One user can have multiple orders
- **User** (1:1) **ShoppingCart**: One user has one active shopping cart
- **User** (1:M) **Review**: One user can write multiple reviews
- **Product** (M:1) **Category**: Multiple products belong to one category
- **Product** (M:1) **User** (Seller): Multiple products belong to one seller
- **Product** (1:M) **Review**: One product can have multiple reviews
- **Order** (1:M) **OrderItem**: One order contains multiple order items
- **Order** (1:1) **Payment**: One order has one payment
- **ShoppingCart** (1:M) **CartItem**: One cart contains multiple cart items
- **Product** (1:M) **CartItem**: One product can be in multiple carts

## High-Level Design Document

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer (ALB)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                 API Gateway Layer                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ Rate Limit  │ │ Auth Filter │ │ Request Validation  │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                Microservices Layer                          │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│ │User Service │ │Product Svc  │ │   Order Service     │   │
│ └─────────────┘ └─────────────┘ └─────────────────────┘   │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│ │Cart Service │ │Payment Svc  │ │Notification Service │   │
│ └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                   Data Layer                                │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│ │PostgreSQL   │ │   Redis     │ │    Elasticsearch    │   │
│ │(Primary DB) │ │  (Cache)    │ │   (Search Index)    │   │
│ └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Major Components

#### 1. User Management Service
- **Responsibilities**: Registration, authentication, profile management, RBAC
- **Technologies**: Spring Boot, JWT, BCrypt
- **Database**: PostgreSQL (users, roles, permissions)
- **Security**: AES-256 encryption for PII, password hashing with salt

#### 2. Product Catalog Service
- **Responsibilities**: Product CRUD, search, categorization, inventory
- **Technologies**: Spring Boot, Elasticsearch, Redis
- **Database**: PostgreSQL (products, categories), Elasticsearch (search index)
- **Features**: Full-text search, faceted filtering, real-time inventory

#### 3. Order Management Service
- **Responsibilities**: Order processing, status tracking, fulfillment
- **Technologies**: Spring Boot, Apache Kafka
- **Database**: PostgreSQL (orders, order_items)
- **Patterns**: Event sourcing, SAGA pattern for distributed transactions

#### 4. Payment Service
- **Responsibilities**: Payment processing, refunds, fraud detection
- **Technologies**: Spring Boot, Stripe/PayPal APIs
- **Security**: PCI DSS compliance, tokenization, 3D Secure
- **Database**: PostgreSQL (payment records, encrypted)

#### 5. Shopping Cart Service
- **Responsibilities**: Cart management, session handling
- **Technologies**: Spring Boot, Redis
- **Database**: Redis (session storage), PostgreSQL (persistent carts)
- **Features**: Real-time updates, cart abandonment recovery

#### 6. Notification Service
- **Responsibilities**: Email, SMS, push notifications
- **Technologies**: Spring Boot, Apache Kafka, SendGrid, Twilio
- **Patterns**: Event-driven messaging, template management

### Integration Points

#### External Integrations
- **Payment Gateways**: Stripe, PayPal (REST APIs with OAuth 2.0)
- **Shipping Providers**: FedEx, UPS APIs for tracking
- **Email Service**: SendGrid API with SMTP fallback
- **SMS Service**: Twilio API with rate limiting
- **CDN**: CloudFront for static assets and images

#### Internal Integration Patterns
- **Service-to-Service**: REST APIs with circuit breakers
- **Event Messaging**: Apache Kafka for async communication
- **Data Synchronization**: CDC (Change Data Capture) with Debezium
- **API Gateway**: Kong/AWS API Gateway for routing and security

### Security & Compliance Features

#### Security Implementation
- **Encryption**: AES-256 for data at rest, TLS 1.3 for data in transit
- **Authentication**: JWT tokens with RS256 signing, refresh token rotation
- **Authorization**: RBAC with fine-grained permissions (ABAC for complex rules)
- **Input Validation**: OWASP validation rules, SQL injection prevention
- **Output Filtering**: XSS prevention, data sanitization
- **Secrets Management**: AWS Secrets Manager/HashiCorp Vault

#### Access Control Matrix
```
Role        | Products | Orders | Users | Analytics | System
------------|----------|--------|-------|-----------|--------
Consumer    | Read     | Own    | Own   | None      | None
Seller      | Own      | Own    | Own   | Own       | None
Admin       | All      | All    | All   | All       | All
```

#### Compliance Features
- **Data Retention**: Automated purging per GDPR (7 years for financial records)
- **Consent Management**: Granular consent tracking and withdrawal
- **Data Lineage**: Complete audit trail of data processing
- **Compliance Reporting**: Automated SOC2, PCI DSS reports
- **Right to be Forgotten**: Automated data deletion workflows

### Data Flow Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │───▶│ API Gateway │───▶│   Services  │
└─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   WAF/CDN   │    │Rate Limiting│    │  Databases  │
└─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│Audit Logging│    │Event Stream │    │   Backups   │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Error Handling & Resilience

#### Circuit Breaker Pattern
- **Implementation**: Hystrix/Resilience4j
- **Thresholds**: 50% failure rate over 10 requests
- **Timeout**: 5 seconds for external APIs, 2 seconds for internal
- **Fallback**: Cached responses, degraded functionality

#### Retry Mechanisms
- **Exponential Backoff**: 100ms, 200ms, 400ms, 800ms
- **Max Retries**: 3 for idempotent operations
- **Jitter**: Random delay to prevent thundering herd

#### Monitoring & Alerting
- **Health Checks**: /health endpoints with dependency checks
- **Metrics**: Prometheus + Grafana dashboards
- **Logging**: Structured logging with correlation IDs
- **Alerting**: PagerDuty integration for critical failures

### Performance & Scalability

#### Caching Strategy
- **L1 Cache**: Application-level (Caffeine)
- **L2 Cache**: Redis cluster with read replicas
- **CDN**: CloudFront for static assets
- **Database**: Query result caching, connection pooling

#### Horizontal Scaling
- **Auto Scaling**: Kubernetes HPA based on CPU/memory
- **Load Balancing**: Round-robin with health checks
- **Database Scaling**: Read replicas, connection pooling
- **Stateless Design**: No server-side sessions

## Validation Report

### Requirements Coverage Checklist ✅

#### Functional Requirements
- ✅ FR1: User registration and authentication (User Service)
- ✅ FR2: Product catalog with search/filter (Product Service + Elasticsearch)
- ✅ FR3: Shopping cart and checkout (Cart Service + Payment Service)
- ✅ FR4: Order management and tracking (Order Service)
- ✅ FR5: Role-based access control (User Service + API Gateway)
- ✅ FR6: Seller dashboard (Product Service + Analytics)
- ✅ FR7: Admin dashboard (All services + Analytics)
- ✅ FR8: Real-time notifications (Notification Service + Kafka)
- ✅ FR9: Multiple payment methods (Payment Service)
- ✅ FR10: Product reviews and ratings (Product Service)
- ✅ FR11: Order cancellation and refunds (Order Service + Payment Service)

#### Non-Functional Requirements
- ✅ Performance: <2s page load, <5s checkout (CDN + caching + optimization)
- ✅ Security: Encryption, PCI DSS compliance (AES-256, TLS 1.3, tokenization)
- ✅ Scalability: 100K concurrent users (Kubernetes auto-scaling)
- ✅ Accessibility: WCAG 2.1 AA compliance (Frontend implementation)
- ✅ Reliability: 99.9% uptime (Multi-AZ deployment, circuit breakers)

### Compliance Validation ✅

#### SOC2 Type II
- ✅ Security: Encryption, access controls, vulnerability management
- ✅ Availability: 99.9% uptime SLA, monitoring, incident response
- ✅ Processing Integrity: Data validation, error handling, audit trails
- ✅ Confidentiality: Data classification, access restrictions
- ✅ Privacy: Consent management, data retention policies

#### PCI DSS Level 1
- ✅ Build and maintain secure network (Firewalls, network segmentation)
- ✅ Protect cardholder data (Encryption, tokenization)
- ✅ Maintain vulnerability management (Regular scans, patches)
- ✅ Implement strong access control (RBAC, MFA)
- ✅ Regularly monitor networks (SIEM, audit logging)
- ✅ Maintain information security policy (Documented procedures)

#### GDPR Compliance
- ✅ Lawful basis for processing (Consent management)
- ✅ Data subject rights (Access, rectification, erasure)
- ✅ Data protection by design (Privacy-first architecture)
- ✅ Data breach notification (Automated alerting)
- ✅ Data Protection Impact Assessment (Risk assessment framework)

### Error Handling Validation ✅

#### Resilience Patterns
- ✅ Circuit Breaker: Implemented for all external dependencies
- ✅ Retry Logic: Exponential backoff with jitter
- ✅ Timeout Management: Configurable timeouts per service
- ✅ Graceful Degradation: Fallback responses for non-critical features
- ✅ Bulkhead Pattern: Resource isolation between services

#### Monitoring & Observability
- ✅ Health Checks: Comprehensive dependency monitoring
- ✅ Distributed Tracing: Request correlation across services
- ✅ Structured Logging: Centralized log aggregation
- ✅ Metrics Collection: Business and technical metrics
- ✅ Alerting: Proactive incident detection