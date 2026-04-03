import { z } from 'zod';
import { insertManagerSchema, insertDriverSchema, insertVehicleSchema, insertTripSchema, insertEmergencySchema, managers, drivers, vehicles, trips, emergencies, type EnhancedTrip } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    managerLogin: {
      method: 'POST' as const,
      path: '/api/auth/manager/login',
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.custom<typeof managers.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    driverLogin: {
      method: 'POST' as const,
      path: '/api/auth/driver/login',
      input: z.object({ temporaryUsername: z.string(), temporaryPassword: z.string() }),
      responses: {
        200: z.custom<typeof trips.$inferSelect & { driver: typeof drivers.$inferSelect, vehicle: typeof vehicles.$inferSelect }>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  vehicles: {
    register: {
      method: 'POST' as const,
      path: '/api/vehicles/register',
      input: insertVehicleSchema,
      responses: {
        201: z.custom<typeof vehicles.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    assignDriver: {
      method: 'POST' as const,
      path: '/api/trips/assign',
      input: z.object({ driverNumber: z.string(), vehicleNumber: z.string() }),
      responses: {
        200: z.custom<typeof trips.$inferSelect & { driver: typeof drivers.$inferSelect, vehicle: typeof vehicles.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/vehicles',
      responses: {
        200: z.array(z.custom<typeof vehicles.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/vehicles/:id',
      responses: {
        200: z.custom<typeof vehicles.$inferSelect & { driver?: typeof drivers.$inferSelect | null }>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/vehicles/:vehicleNumber',
      input: z.object({
        vehicleType: z.string().optional(),
        fuelCapacity: z.number().optional(),
        currentFuel: z.number().optional(),
        currentMileage: z.number().optional(),
      }),
      responses: {
        200: z.custom<typeof vehicles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/vehicles/:id/status',
      input: z.object({
        currentFuel: z.number().optional(),
        currentMileage: z.number().optional(),
      }),
      responses: {
        200: z.custom<typeof vehicles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },
  fuel: {
    add: {
      method: 'POST' as const,
      path: '/api/fuel/add',
      input: z.object({
        vehicleNumber: z.string(),
        amount: z.string(),
        cost: z.string(),
        mileage: z.number(),
      }),
      responses: {
        201: z.any(),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/fuel/:vehicleNumber',
      responses: {
        200: z.array(z.any()),
      },
    },
  },
  service: {
    add: {
      method: 'POST' as const,
      path: '/api/service/add',
      input: z.object({
        vehicleNumber: z.string(),
        description: z.string(),
        cost: z.string(),
        mileage: z.number(),
      }),
      responses: {
        201: z.any(),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/service/:vehicleNumber',
      responses: {
        200: z.array(z.any()),
      },
    },
  },
  drivers: {
    register: {
      method: 'POST' as const,
      path: '/api/drivers/register',
      input: insertDriverSchema,
      responses: {
        201: z.custom<typeof drivers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/drivers',
      responses: {
        200: z.array(z.custom<typeof drivers.$inferSelect>()),
      },
    },
    getMe: {
      method: 'GET' as const,
      path: '/api/drivers/me',
      responses: {
        200: z.custom<typeof drivers.$inferSelect & { vehicle?: typeof vehicles.$inferSelect | null }>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/drivers/:driverNumber',
      input: z.object({
        name: z.string().optional(),
        phoneNumber: z.string().optional(),
        licenseNumber: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof drivers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  trips: {
    assign: {
      method: 'POST' as const,
      path: '/api/trips/assign',
      input: z.object({ 
        driverNumber: z.string(), 
        vehicleNumber: z.string(),
        startLocation: z.string().optional(),
        startLatitude: z.number().optional(),
        startLongitude: z.number().optional(),
        endLocation: z.string().optional(),
        endLatitude: z.number().optional(),
        endLongitude: z.number().optional(),
        selectedRoute: z.any().optional(),
        routeId: z.string().optional(),
        routeData: z.any().optional(),
        safetyMetrics: z.any().optional(),
        estimatedTime: z.number().optional(),
        distance: z.number().optional()
      }),
      responses: {
        200: z.custom<typeof trips.$inferSelect & { driver: typeof drivers.$inferSelect, vehicle: typeof vehicles.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    complete: {
      method: 'POST' as const,
      path: '/api/trips/complete',
      input: z.object({ tripId: z.number() }),
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    cancel: {
      method: 'POST' as const,
      path: '/api/trips/cancel',
      input: z.object({ tripId: z.number() }),
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/trips',
      responses: {
        200: z.array(z.custom<typeof trips.$inferSelect & { driver: typeof drivers.$inferSelect, vehicle: typeof vehicles.$inferSelect }>()),
      },
    },
    getCurrent: {
      method: 'GET' as const,
      path: '/api/trips/current',
      responses: {
        200: z.custom<EnhancedTrip>(),
        404: errorSchemas.notFound,
      },
    },
  },
  emergency: {
    trigger: {
      method: 'POST' as const,
      path: '/api/emergency/trigger',
      input: z.any(), 
      responses: {
        201: z.custom<typeof emergencies.$inferSelect>(),
      },
    },
    acknowledge: {
      method: 'POST' as const,
      path: '/api/emergency/acknowledge',
      input: z.object({ emergencyId: z.number() }),
      responses: {
        200: z.custom<typeof emergencies.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/emergencies',
      responses: {
        200: z.array(z.custom<typeof emergencies.$inferSelect & { driver: typeof drivers.$inferSelect, vehicle: typeof vehicles.$inferSelect }>()),
      },
    },
    nearbyFacilities: {
      method: 'GET' as const,
      path: '/api/emergency/nearby-facilities',
      responses: {
        200: z.array(z.object({
          name: z.string(),
          type: z.enum(["police", "hospital"]),
          latitude: z.number(),
          longitude: z.number(),
          distance: z.number(),
          phone: z.string(),
        })),
      },
    },
  },
  routes: {
    discover: {
      method: 'POST' as const,
      path: '/api/routes/discover',
      input: z.object({
        start: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        end: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
      }),
      responses: {
        200: z.object({
          routes: z.array(z.object({
            routeId: z.number(),
            geometry: z.object({
              type: z.literal('LineString'),
              coordinates: z.array(z.array(z.number())),
            }),
            distance: z.number(),
            estimatedTime: z.number(),
          })),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    getDetails: {
      method: 'GET' as const,
      path: '/api/routes/:routeId/details',
      responses: {
        200: z.object({
          routeId: z.number(),
          geometry: z.object({
            type: z.literal('LineString'),
            coordinates: z.array(z.array(z.number())),
          }),
          distance: z.number(),
          estimatedTime: z.number(),
        }),
        404: errorSchemas.notFound,
      },
    },
  },
  safety: {
    analyzeRoute: {
      method: 'POST' as const,
      path: '/api/safety/analyze-route',
      input: z.object({
        start: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        end: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        timestamp: z.number().optional(),
      }),
      responses: {
        200: z.object({
          routes: z.array(z.object({
            routeId: z.string(),
            geometry: z.object({
              type: z.literal('LineString'),
              coordinates: z.array(z.array(z.number())),
            }),
            distance: z.number(),
            estimatedTime: z.number(),
            safetyMetrics: z.object({
              accidentFrequencyScore: z.number(),
              crimeZoneWeight: z.number(),
              roadConditionScore: z.number(),
              timeRiskFactor: z.number(),
              overallSafetyScore: z.number(),
            }),
            dangerZones: z.array(z.object({
              zoneId: z.string(),
              location: z.object({
                lat: z.number(),
                lng: z.number(),
              }),
              radius: z.number(),
              riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
              riskType: z.enum(['accident_prone', 'high_crime', 'poor_road', 'combined']),
              accidentCount: z.number(),
              crimeIncidents: z.number(),
              roadConditionIssues: z.array(z.string()),
              alertThresholdDistance: z.number(),
              description: z.string(),
            })),
            isRecommended: z.boolean(),
          })),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
  },
};

export const socketEvents = {
  EMERGENCY_TRIGGERED: 'emergency_triggered',
  LOCATION_UPDATE: 'location_update',
  ALARM_STOP: 'alarm_stop',
  ACKNOWLEDGEMENT_SENT: 'acknowledgement_sent',
  RECEIVE_EMERGENCY: 'receive_emergency',
  RECEIVE_LOCATION: 'receive_location',
  STOP_ALARM: 'stop_alarm',
  RECEIVE_ACKNOWLEDGEMENT: 'receive_acknowledgement',
  NEW_EMERGENCY: 'new_emergency',
  EMERGENCY_ACKNOWLEDGED: 'emergency_acknowledged',
} as const;
