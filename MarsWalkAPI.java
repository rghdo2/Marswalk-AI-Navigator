
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

            sendJson(exchange,
                "{\"project\":\"MarsWalk AI Navigator\","
                + "\"status\":\"running\"}", 200);
        });

        server.createContext("/api/mission", exchange -> {

            if (!exchange.getRequestMethod().equals("GET")) {
                sendJson(exchange,
                    "{\"error\":\"Method not allowed\"}", 405);
                return;
            }

            double availableTime = 180;

            String query = exchange.getRequestURI().getRawQuery();

            if (query != null) {
                for (String parameter : query.split("&")) {

                    if (parameter.startsWith("time=")) {
                        try {
                            availableTime = Double.parseDouble(
                                parameter.substring(5)
                            );
                        } catch (NumberFormatException e) {
                            sendJson(exchange,
                                "{\"error\":\"Invalid time value\"}", 400);
                            return;
                        }
                    }
                }
            }

            if (!Double.isFinite(availableTime)
                    || availableTime <= 0
                    || availableTime > 10080) {

                sendJson(exchange,
                    "{\"error\":\"Time must be between 0 and 10080 minutes\"}",
                    400);
                return;
            }

            String response =
                MissionService.getMissionResult(availableTime);

            sendJson(exchange, response, 200);
        });

        server.start();

        System.out.println("=== MarsWalk API ===");
        System.out.println("Server is running on port " + port);
    }

    static void sendJson(
            HttpExchange exchange,
            String response,
            int statusCode) throws IOException {

        byte[] data = response.getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().set(
            "Content-Type", "application/json; charset=UTF-8"
        );

        exchange.sendResponseHeaders(statusCode, data.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(data);
        }
    }
}
