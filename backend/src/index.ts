import "dotenv/config";
import http from "http";
import { dealCards } from "./game/beloteEngine";
import { PlayerId } from "./game/types";
import { setupWebSocketServer } from "./realtime";
import {
    AVATAR_BUCKET,
    requireSupabaseUser,
    supabaseAdmin,
    hasSupabaseConfig,
} from "./supabase";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    // CORS pour le front
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

    if (req.method === "POST" && req.url === "/avatar/upload-url") {
        if (!hasSupabaseConfig || !supabaseAdmin) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Supabase n'est pas configuré côté serveur." }));
            return;
        }

        let payload: { accessToken?: string; fileExt?: string } | null = null;
        try {
            payload = await parseJsonBody(req);
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Corps de requête invalide." }));
            return;
        }

        const accessToken = payload?.accessToken;
        const fileExt = payload?.fileExt;
        if (!accessToken) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Token Supabase manquant." }));
            return;
        }

        try {
            const user = await requireSupabaseUser(accessToken);
            const normalizedExt =
                typeof fileExt === "string" && fileExt.trim()
                    ? fileExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
                    : "png";
            const path = `${user.id}/${Date.now()}.${normalizedExt}`;

            const { data, error } = await supabaseAdmin.storage
                .from(AVATAR_BUCKET)
                .createSignedUploadUrl(path, { upsert: true });

            if (error || !data?.signedUrl) {
                throw new Error(error?.message ?? "Impossible de générer l'URL d'upload.");
            }

            const { data: publicData } = supabaseAdmin.storage
                .from(AVATAR_BUCKET)
                .getPublicUrl(path);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    uploadUrl: data.signedUrl,
                    path: data.path ?? path,
                    publicUrl: publicData?.publicUrl ?? null,
                })
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Impossible de préparer l'upload.";
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: message }));
        }
        return;
    }

    if (req.url === "/debug/deal") {
        const dealer: PlayerId = 0;
        const deal = dealCards(dealer);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(deal));
        return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
});

setupWebSocketServer(server);

server.listen(PORT, () => {
    console.log(`belote-live backend listening on port ${PORT}`);
});

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
            try {
                const raw = Buffer.concat(chunks).toString("utf8").trim();
                if (!raw) {
                    resolve({});
                    return;
                }
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", (error) => reject(error));
    });
}
