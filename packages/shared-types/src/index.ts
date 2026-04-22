// Shared types across all NibServe apps

export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER = 'driver',
  RESTAURANT_OWNER = 'restaurant_owner',
  ADMIN = 'admin',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY_FOR_PICKUP = 'ready_for_pickup',
  EN_ROUTE_TO_RESTAURANT = 'en_route_to_restaurant',
  PICKED_UP = 'picked_up',
  EN_ROUTE_TO_CUSTOMER = 'en_route_to_customer',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CASH_ON_DELIVERY = 'cash_on_delivery',
}

export interface IUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  role: UserRole;
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRestaurant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  logoUrl?: string;
  address: string;
  lat: number;
  lng: number;
  isActive: boolean;
  averageRating?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategory {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
}

export interface IMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface IOrder {
  id: string;
  customerId: string;
  restaurantId: string;
  driverId?: string;
  status: OrderStatus;
  total: number;
  address: string;
  paymentMethod: PaymentMethod;
  items: IOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  price: number;
}

export interface IDriver {
  id: string;
  userId: string;
  vehicleType: string;
  isAvailable: boolean;
  currentLat?: number;
  currentLng?: number;
}

export interface IReview {
  id: string;
  orderId: string;
  customerId: string;
  restaurantId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface IChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderType: 'customer' | 'driver' | 'restaurant' | 'bot';
  message: string;
  createdAt: Date;
}

export interface IChatbotRule {
  id: string;
  restaurantId: string;
  triggerKeywords: string[];
  responseText: string;
  category?: string;
}

export interface INotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

// WebSocket event types
export enum SocketEvent {
  ORDER_STATUS_UPDATED = 'order:status_updated',
  DRIVER_LOCATION_UPDATED = 'driver:location_updated',
  CHAT_MESSAGE = 'chat:message',
  ORDER_ASSIGNED = 'order:assigned',
  ORDER_NEW = 'order:new',
}
