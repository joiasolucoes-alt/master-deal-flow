import type { Order } from "@/data/types";
import type { OrderRepository } from "@/features/orders/repositories/orderRepository";

export function createLocalOrderRepository(options: {
  getOrders: () => Order[];
  saveOrder: (order: Order) => void;
}): OrderRepository {
  return {
    async list() {
      return options.getOrders();
    },
    async getById(id: string) {
      return options.getOrders().find((order) => order.id === id) ?? null;
    },
    async findBySimulationId(simulationId: string) {
      return options.getOrders().find((order) => order.simulationId === simulationId) ?? null;
    },
    async save(order: Order) {
      const existing =
        order.simulationId != null
          ? (options.getOrders().find((item) => item.simulationId === order.simulationId) ?? null)
          : null;
      if (existing && existing.id !== order.id) {
        throw new Error(`Simulação já convertida no pedido ${existing.number}.`);
      }
      options.saveOrder(order);
      return order;
    },
  };
}
