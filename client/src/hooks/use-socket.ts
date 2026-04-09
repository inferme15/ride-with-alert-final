import { useEffect, useRef } from "react";
import io, { Socket } from "socket.io-client";
import { socketEvents } from "@shared/routes";

// Assuming socket connects to the same host
const SOCKET_URL = window.location.origin;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log("🔌 [SOCKET] Initializing socket connection to:", SOCKET_URL);
    
    socketRef.current = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket"], // Force websocket for better performance
    });

    socketRef.current.on("connect", () => {
      console.log("✅ [SOCKET] Connected successfully, ID:", socketRef.current?.id);
    });

    socketRef.current.on("disconnect", () => {
      console.log("❌ [SOCKET] Disconnected");
    });

    socketRef.current.on("error", (error) => {
      console.error("❌ [SOCKET] Error:", error);
    });

    return () => {
      console.log("🧹 [SOCKET] Cleaning up socket connection");
      socketRef.current?.disconnect();
    };
  }, []);

  const emit = (event: string, data: any) => {
    console.log("📤 [SOCKET] Emitting event:", event, data);
    socketRef.current?.emit(event, data);
  };

  const subscribe = (event: string, callback: (data: any) => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn("⚠️ [SOCKET] Socket not initialized, cannot subscribe to:", event);
      return;
    }
    
    console.log("📥 [SOCKET] Subscribing to event:", event);
    socket.on(event, callback);
    return () => {
      console.log("🧹 [SOCKET] Unsubscribing from event:", event);
      socket.off(event, callback);
    };
  };

  return { socket: socketRef.current, emit, subscribe, events: socketEvents };
}
