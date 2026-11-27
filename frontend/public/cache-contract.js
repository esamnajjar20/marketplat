/* generated from shared/cache/cache-contract.json — do not edit */
self.MARKET_CACHE_CONTRACT = {
  "version": 3,
  "keyAlgorithmVersion": 1,
  "domains": {
    "adsList": {
      "namespace": "ads-list",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "ads"
        ]
      ]
    },
    "productList": {
      "namespace": "products-list",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "products"
        ]
      ]
    },
    "productDetail": {
      "namespace": "product-detail",
      "scope": "public",
      "policy": "publicDetail",
      "queryPrefixes": [
        [
          "products"
        ]
      ]
    },
    "serviceList": {
      "namespace": "services-list",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "service-listings"
        ]
      ]
    },
    "serviceProviderList": {
      "namespace": "providers-list",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "service-providers"
        ]
      ]
    },
    "storeList": {
      "namespace": "stores-list",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "stores"
        ]
      ]
    },
    "categories": {
      "namespace": "categories",
      "scope": "public",
      "policy": "reference",
      "queryPrefixes": [
        [
          "categories"
        ]
      ]
    },
    "productCategories": {
      "namespace": "product-categories",
      "scope": "public",
      "policy": "reference",
      "queryPrefixes": [
        [
          "product-categories"
        ]
      ]
    },
    "serviceCategories": {
      "namespace": "service-categories",
      "scope": "public",
      "policy": "reference",
      "queryPrefixes": [
        [
          "service-categories"
        ],
        [
          "service-types"
        ]
      ]
    },
    "home": {
      "namespace": "home",
      "scope": "public",
      "policy": "publicHome",
      "queryPrefixes": [
        [
          "home"
        ]
      ]
    },
    "recommendations": {
      "namespace": "recommendations",
      "scope": "personal",
      "policy": "recommendations",
      "queryPrefixes": [
        [
          "recommendations"
        ]
      ]
    },
    "search": {
      "namespace": "search",
      "scope": "public",
      "policy": "publicLive",
      "queryPrefixes": [
        [
          "search"
        ]
      ]
    },
    "profile": {
      "namespace": "profile",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "auth",
          "me"
        ]
      ]
    },
    "seller": {
      "namespace": "seller",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "sellers",
          "me"
        ],
        [
          "sellers"
        ]
      ]
    },
    "storeSelf": {
      "namespace": "store-self",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "stores",
          "me"
        ]
      ]
    },
    "providerSelf": {
      "namespace": "provider-self",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "service-providers",
          "me"
        ]
      ]
    },
    "activity": {
      "namespace": "activity",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "activity"
        ]
      ]
    },
    "savedSearches": {
      "namespace": "saved-searches",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "saved-searches"
        ]
      ]
    },
    "appointments": {
      "namespace": "appointments",
      "scope": "personal",
      "policy": "personal",
      "queryPrefixes": [
        [
          "appointments"
        ]
      ]
    },
    "notifications": {
      "namespace": "notifications",
      "scope": "personal",
      "policy": "messages",
      "queryPrefixes": [
        [
          "notifications"
        ]
      ]
    },
    "conversations": {
      "namespace": "conversations",
      "scope": "personal",
      "policy": "messages",
      "queryPrefixes": [
        [
          "conversations"
        ]
      ]
    },
    "messages": {
      "namespace": "messages",
      "scope": "personal",
      "policy": "messages",
      "queryPrefixes": [
        [
          "conversations"
        ]
      ]
    },
    "media": {
      "namespace": "media",
      "scope": "private",
      "policy": "security",
      "queryPrefixes": []
    },
    "userProfile": {
      "namespace": "user-profile",
      "scope": "private",
      "policy": "privateUserProfile",
      "queryPrefixes": []
    }
  },
  "invalidation": [
    {
      "prefixes": [
        "/ads",
        "/favorites"
      ],
      "domains": [
        "adsList"
      ],
      "local": [
        "ads",
        "myAds"
      ]
    },
    {
      "prefixes": [
        "/products",
        "/promotions",
        "/collections"
      ],
      "domains": [
        "productList",
        "productDetail",
        "home"
      ],
      "local": [
        "products"
      ]
    },
    {
      "prefixes": [
        "/service-listings"
      ],
      "domains": [
        "serviceList",
        "home"
      ],
      "local": [
        "services"
      ]
    },
    {
      "prefixes": [
        "/service-providers"
      ],
      "domains": [
        "serviceProviderList",
        "home"
      ],
      "local": [
        "services",
        "providerSelf"
      ]
    },
    {
      "prefixes": [
        "/stores",
        "/store-types"
      ],
      "domains": [
        "storeList",
        "home"
      ],
      "local": [
        "stores",
        "storeSelf"
      ]
    },
    {
      "prefixes": [
        "/categories"
      ],
      "domains": [
        "categories",
        "home"
      ],
      "local": [
        "categories"
      ]
    },
    {
      "prefixes": [
        "/product-categories"
      ],
      "domains": [
        "productCategories",
        "productList",
        "home"
      ],
      "local": [
        "productCategories"
      ]
    },
    {
      "prefixes": [
        "/service-categories",
        "/service-types"
      ],
      "domains": [
        "serviceCategories",
        "serviceList",
        "home"
      ],
      "local": [
        "serviceCategories"
      ]
    },
    {
      "prefixes": [
        "/activity"
      ],
      "domains": [
        "activity"
      ],
      "local": [
        "activity"
      ]
    },
    {
      "prefixes": [
        "/saved-searches"
      ],
      "domains": [
        "savedSearches"
      ],
      "local": [
        "savedSearches"
      ]
    },
    {
      "prefixes": [
        "/appointments"
      ],
      "domains": [
        "appointments"
      ],
      "local": [
        "appointments"
      ]
    },
    {
      "prefixes": [
        "/users/me"
      ],
      "domains": [
        "profile",
        "recommendations",
        "userProfile"
      ],
      "local": [
        "profile"
      ]
    },
    {
      "prefixes": [
        "/sellers/me"
      ],
      "domains": [
        "seller",
        "recommendations"
      ],
      "local": [
        "seller"
      ]
    },
    {
      "prefixes": [
        "/notifications"
      ],
      "domains": [
        "notifications"
      ],
      "local": [
        "notifications"
      ]
    },
    {
      "prefixes": [
        "/conversations"
      ],
      "domains": [
        "conversations",
        "messages"
      ],
      "local": [
        "conversations",
        "messages"
      ]
    },
    {
      "prefixes": [
        "/messages"
      ],
      "domains": [
        "messages",
        "conversations"
      ],
      "local": [
        "messages",
        "conversations"
      ]
    }
  ],
  "mobileMutationInvalidation": [
    {
      "route": "^/api/v1/(?:ads|ad-images)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/ads",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/ads",
        "api-public:/api/v1/search",
        "ads:",
        "ad-detail:"
      ]
    },
    {
      "route": "^/api/v1/(?:products|product-images)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/products",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/products",
        "api-public:/api/v1/stores",
        "api-public:/api/v1/search",
        "home:public-products:v1"
      ]
    },
    {
      "route": "^/api/v1/(?:service-listings|services|service-images)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/service-listings",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/service-listings",
        "api-public:/api/v1/search",
        "service-listings:",
        "home:public-services:v1"
      ]
    },
    {
      "route": "^/api/v1/(?:stores|store-members|store-invites|store-promotions|store-hours)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/stores",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/stores",
        "api-public:/api/v1/search",
        "home:public-stores:v1"
      ]
    },
    {
      "route": "^/api/v1/(?:favorites|favourites)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/favorites",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/search",
        "api-public:/api/v1/ads",
        "api-public:/api/v1/products"
      ]
    },
    {
      "route": "^/api/v1/(?:stories)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/stories",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/stories",
        "api-public:/api/v1/search"
      ]
    },
    {
      "route": "^/api/v1/(?:blocks|blocked-users)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/blocks",
        "/api/v1/blocked-users",
        "/api/v1/users/me"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/(?:users|profile|sellers)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/users",
        "/api/v1/sellers/me",
        "/api/v1/service-providers"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/sellers",
        "api-public:/api/v1/search",
        "api-public:/api/v1/service-listings"
      ]
    },
    {
      "route": "^/api/v1/(?:service-providers)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/service-providers",
        "/api/v1/service-listings"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/service-listings",
        "api-public:/api/v1/sellers/ranking",
        "home:public-services:v1"
      ]
    },
    {
      "route": "^/api/v1/(?:service-reviews|reviews|ratings)(?:/|$)",
      "privatePrefixes": [
        "/api/v1/service-reviews",
        "/api/v1/service-listings",
        "/api/v1/service-providers"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/service-listings",
        "api-public:/api/v1/sellers/ranking",
        "home:public-services:v1"
      ]
    },
    {
      "route": "^/api/v1/service-requests(?:/|$)",
      "privatePrefixes": [
        "/api/v1/service-requests"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/follows(?:/|$)",
      "privatePrefixes": [
        "/api/v1/follows",
        "/api/v1/users/me"
      ],
      "publicPrefixes": [
        "api-public:/api/v1/search"
      ]
    },
    {
      "route": "^/api/v1/orders(?:/|$)",
      "privatePrefixes": [
        "/api/v1/orders"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/requests(?:/|$)",
      "privatePrefixes": [
        "/api/v1/requests"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/appointments(?:/|$)",
      "privatePrefixes": [
        "/api/v1/appointments"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/sales(?:/|$)",
      "privatePrefixes": [
        "/api/v1/sales"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/customers(?:/|$)",
      "privatePrefixes": [
        "/api/v1/customers"
      ],
      "publicPrefixes": []
    },
    {
      "route": "^/api/v1/notifications(?:/|$)",
      "privatePrefixes": [
        "/api/v1/notifications"
      ],
      "publicPrefixes": []
    }
  ],
  "publicMutationTags": {
    "methods": [
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ],
    "reservedSegments": [
      "me",
      "search",
      "featured",
      "ranking",
      "suggestions",
      "categories",
      "types",
      "availability",
      "nearby",
      "stats",
      "analytics",
      "bulk"
    ],
    "nonPublicContentActions": [
      "follow",
      "unfollow",
      "favorite",
      "favorites",
      "like",
      "likes",
      "view",
      "views",
      "click",
      "clicks",
      "impression",
      "impressions",
      "tracking",
      "track",
      "share",
      "shares",
      "members",
      "memberships",
      "member-invites"
    ],
    "safeEntityIdPattern": "^[A-Za-z0-9_-]{1,128}$",
    "resources": {
      "ads": {
        "routeTags": [
          "route:ads",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "ad"
      },
      "products": {
        "routeTags": [
          "route:products",
          "route:collections",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "product"
      },
      "promotions": {
        "routeTags": [
          "route:products",
          "route:collections",
          "route:home",
          "route:search"
        ]
      },
      "collections": {
        "routeTags": [
          "route:collections",
          "route:products",
          "route:home",
          "route:search"
        ]
      },
      "stores": {
        "routeTags": [
          "route:stores",
          "route:badges",
          "route:public",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "store"
      },
      "sellers": {
        "routeTags": [
          "route:sellers",
          "route:ads",
          "route:products",
          "route:stores",
          "route:collections",
          "route:requests",
          "route:service-listings",
          "route:service-providers",
          "route:service-reviews",
          "route:stories",
          "route:follows",
          "route:badges",
          "route:public",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "seller"
      },
      "users": {
        "routeTags": [
          "route:users",
          "route:sellers",
          "route:ads",
          "route:products",
          "route:stores",
          "route:collections",
          "route:requests",
          "route:service-listings",
          "route:service-providers",
          "route:service-reviews",
          "route:stories",
          "route:follows",
          "route:badges",
          "route:public",
          "route:home",
          "route:search"
        ]
      },
      "service-reviews": {
        "routeTags": [
          "route:service-reviews",
          "route:badges",
          "route:search"
        ]
      },
      "sales": {
        "routeTags": [
          "route:public"
        ]
      },
      "store-types": {
        "routeTags": [
          "route:store-types",
          "route:stores",
          "route:home",
          "route:search"
        ]
      },
      "service-listings": {
        "routeTags": [
          "route:service-listings",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "service"
      },
      "service-providers": {
        "routeTags": [
          "route:service-providers",
          "route:service-listings",
          "route:badges",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "provider"
      },
      "service-categories": {
        "routeTags": [
          "route:service-categories",
          "route:service-listings",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "category"
      },
      "service-types": {
        "routeTags": [
          "route:service-types",
          "route:service-listings",
          "route:home",
          "route:search"
        ]
      },
      "requests": {
        "routeTags": [
          "route:requests"
        ]
      },
      "categories": {
        "routeTags": [
          "route:categories",
          "route:ads",
          "route:products",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "category"
      },
      "product-categories": {
        "routeTags": [
          "route:product-categories",
          "route:products",
          "route:ads",
          "route:home",
          "route:search"
        ],
        "entityTagPrefix": "category"
      }
    }
  },
  "publicReadTags": {
    "vocabulary": {
      "ads": "route:ads",
      "search": "route:search",
      "products": "route:products",
      "stores": "route:stores",
      "services": "route:service-listings",
      "serviceProviders": "route:service-providers",
      "categories": "route:categories",
      "productCategories": "route:product-categories",
      "serviceCategories": "route:service-categories",
      "serviceTypes": "route:service-types",
      "storeTypes": "route:store-types",
      "home": "route:home"
    },
    "paths": [
      {
        "path": "/ads",
        "tagKeys": [
          "ads",
          "home"
        ]
      },
      {
        "path": "/ads/search",
        "tagKeys": [
          "ads",
          "search",
          "home"
        ]
      },
      {
        "path": "/products",
        "tagKeys": [
          "products",
          "home"
        ]
      },
      {
        "path": "/stores",
        "tagKeys": [
          "stores",
          "home"
        ]
      },
      {
        "path": "/service-listings",
        "tagKeys": [
          "services",
          "home"
        ]
      },
      {
        "path": "/categories",
        "tagKeys": [
          "categories"
        ]
      },
      {
        "path": "/product-categories",
        "tagKeys": [
          "productCategories",
          "products",
          "ads",
          "home"
        ]
      },
      {
        "path": "/service-categories",
        "tagKeys": [
          "serviceCategories",
          "services",
          "home"
        ]
      },
      {
        "path": "/service-types",
        "tagKeys": [
          "serviceTypes",
          "services",
          "home"
        ]
      },
      {
        "path": "/store-types",
        "tagKeys": [
          "storeTypes",
          "stores",
          "home"
        ]
      },
      {
        "path": "/home",
        "tagKeys": [
          "home"
        ]
      },
      {
        "path": "/home/static",
        "tagKeys": [
          "home"
        ]
      }
    ],
    "entityPrefixes": {
      "ad": "ad",
      "product": "product",
      "store": "store",
      "service": "service",
      "category": "category"
    }
  }
};
