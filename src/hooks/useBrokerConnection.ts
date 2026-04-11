"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getCurrentUser } from "@/services/auth.service";
import { getActiveBroker } from "@/services/broker.service";

interface BrokerConnectionState {
  isConnected: boolean;
  brokerName: string | null;
  brokerId: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  hoursUntilExpiry: number;
  lastConnected: string | null;
  refresh: () => void;
}

export function useBrokerConnection(): BrokerConnectionState & { mounted: boolean } {
  const mounted = useIsMounted();
  const [isConnected, setIsConnected] = useState(false);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);
  const [lastConnected, setLastConnected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) {
      setIsConnected(false);
      setBrokerName(null);
      setBrokerId(null);
      setTokenExpiry(null);
      setLastConnected(null);
      return;
    }

    const broker = await getActiveBroker(user.id);
    if (broker) {
      setIsConnected(true);
      setBrokerName(broker.broker_name);
      setBrokerId(broker.broker_id);
      setTokenExpiry(broker.token_expiry);
      setLastConnected(broker.last_connected_at);
    } else {
      setIsConnected(false);
      setBrokerName(null);
      setBrokerId(null);
      setTokenExpiry(null);
      setLastConnected(null);
    }
  }, []);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on mount
    load();

    const dataInterval = setInterval(load, 5 * 60 * 1000);
    const tickInterval = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, [load]);

  let isExpired = false;
  let isExpiringSoon = false;
  let hoursUntilExpiry = 0;

  if (tokenExpiry) {
    const expiryTime = new Date(tokenExpiry).getTime();
    const diff = expiryTime - now;
    isExpired = diff <= 0;
    isExpiringSoon = !isExpired && diff < 60 * 60 * 1000;
    hoursUntilExpiry = Math.max(0, Math.floor(diff / (60 * 60 * 1000)));
  }

  return {
    mounted,
    isConnected,
    brokerName,
    brokerId,
    isExpired,
    isExpiringSoon,
    hoursUntilExpiry,
    lastConnected,
    refresh: load,
  };
}
