import http from "http";
import { dealCards } from "./game/beloteEngine";
import { PlayerId } from "./game/types";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // CORS très permissif pour faciliter le dev front + back en local
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "belote-live-backend" }));
        return;
    }

    if (req.url === "/debug/deal") {
        const dealer: PlayerId = 0; // pour l'instant, donneur fixe
        const deal = dealCards(dealer);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(deal));
        return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
    console.log(`belote-live backend listening on port ${PORT}`);
});
