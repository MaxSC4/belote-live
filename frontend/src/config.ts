const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/ws";

export const config = {
    backendUrl: BACKEND_URL,
    wsUrl: WS_URL,
};
