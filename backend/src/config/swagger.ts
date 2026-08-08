import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Classifieds Platform API",
      version: "1.0.0",
      description: "Classifieds & Marketplace Platform — Backend API",
    },
    servers: [
      { url: "http://localhost:5000/api/v1", description: "Development" },
      {
        url: "https://api.classifieds-platform.com/api/v1",
        description: "Production",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            statusCode: { type: "integer" },
            requestId: { type: "string" },
            errors: { type: "object" },
          },
        },
        PaginationMeta: {
          type: "object",
          properties: {
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },
        TokenPair: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", minLength: 2, example: "أحمد العلي" },
            email: {
              type: "string",
              format: "email",
              example: "ahmed@example.com",
            },
            password: { type: "string", minLength: 8 },
            phone: { type: "string", example: "+966501234567" },
            city: { type: "string", example: "الرياض" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        RefreshRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: { refreshToken: { type: "string" } },
        },
        Ad: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            price: { type: "number", nullable: true },
            images: { type: "array", items: { type: "string", format: "uri" } },
            city: { type: "string" },
            condition: {
              type: "string",
              enum: ["NEW", "USED", "REFURBISHED"],
              nullable: true,
            },
            isNegotiable: { type: "boolean" },
            status: { type: "string", enum: ["ACTIVE", "SOLD", "DELETED"] },
            views: { type: "integer" },
            isFeatured: { type: "boolean" },
            isPinned: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                city: { type: "string" },
                avatarUrl: { type: "string", nullable: true },
              },
            },
            category: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                nameAr: { type: "string" },
              },
            },
          },
        },
        CreateAdRequest: {
          type: "object",
          required: ["title", "description", "city"],
          properties: {
            title: {
              type: "string",
              minLength: 3,
              maxLength: 200,
              example: "iPhone 14 Pro للبيع",
            },
            description: { type: "string", minLength: 10, maxLength: 5000 },
            price: { type: "number", nullable: true, example: 3500 },
            city: { type: "string", example: "الرياض" },
            categoryId: { type: "string" },
            condition: { type: "string", enum: ["NEW", "USED", "REFURBISHED"] },
            isNegotiable: { type: "boolean", default: false },
          },
        },
        CreateCategoryRequest: {
          type: "object",
          required: ["name", "nameAr", "slug"],
          properties: {
            name: { type: "string" },
            nameAr: { type: "string" },
            slug: { type: "string", pattern: "^[a-z0-9-]+$" },
            parentId: { type: "string", nullable: true },
          },
        },
        ReportAdRequest: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: {
              type: "string",
              enum: ["SCAM", "FAKE", "OFFENSIVE", "SPAM"],
            },
            notes: { type: "string", maxLength: 500 },
          },
        },
      },
    },
  },
  apis: ["./src/modules/**/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
