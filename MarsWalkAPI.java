
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class MarsWalkAPI {

    public static void main(String[] args) throws IOException {

        String portValue = System.getenv("PORT");

        int port = (portValue == null || portValue.isBlank())
                ? 8080
                : Integer.parseInt(portValue);

        HttpServer server = HttpServer.create(
            new InetSocketAddress("0.0.0.0", port), 0
        );

        server.createContext("/api/status", exchange -> {

            String response =
                "{\"project\":\"MarsWalk AI Navigator\","
                + "\"status\":\"running\"}";

            sendJson(exchange, response);
        });

        server.createContext("/api/mission", exchange -> {

            String response = MissionService.getMissionResult();

            sendJson(exchange, response);
        });

        server.start();

        System.out.println("=== MarsWalk API ===");
        System.out.println("Server is running on port " + port);
    }

    static void sendJson(HttpExchange exchange, String response)
            throws IOException {

        byte[] data = response.getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().set(
            "Content-Type", "application/json; charset=UTF-8"
        );

        exchange.sendResponseHeaders(200, data.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(data);
        }
    }
}
