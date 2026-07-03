import { freights } from "@/data/freights";
import type { DeliveryRecord } from "@/data/types";
import { createDeliveryFromFreight } from "@/features/deliveries/deliveryHelpers";

export const deliveries: DeliveryRecord[] = freights.map(createDeliveryFromFreight);
