#!/usr/bin/env python3
"""
Test topic profiles generation.
"""

def get_topic_profile(title: str, cls: str, subj: str, content: str):
    combined = f"{title} {cls} {subj} {content}".lower()

    if any(k in combined for k in ["load balancer", "reverse proxy", "traffic", "nginx", "haproxy"]):
        return {
            "category": "Load Balancing & Traffic",
            "objectives": [
                "Understand L4 (Transport Layer) vs L7 (Application Layer) reverse proxy routing algorithms.",
                "Implement active and passive health checks, graceful connection draining, and failover pools.",
                "Explore real-time request packet distribution and server failure rerouting via interactive simulation.",
                "Evaluate operational trade-offs across Round Robin, Least Connections, and Consistent Hashing."
            ],
            "callout_title": "Reverse Proxy Invariant",
            "callout_text": "An effective load balancer must decouple external clients from internal server topologies while guaranteeing sub-millisecond route decisions and zero-downtime rolling deployments.",
            "code_lang": "typescript",
            "code_title": "LoadBalancer.ts",
            "code": """// Production Round-Robin Load Balancer with Health Checks
export interface BackendNode {
  id: string;
  url: string;
  isHealthy: boolean;
  activeRequests: number;
}

export class LoadBalancer {
  private currentIndex = 0;

  constructor(private servers: BackendNode[]) {}

  public getNextServer(): BackendNode {
    const healthyServers = this.servers.filter(s => s.isHealthy);
    if (healthyServers.length === 0) {
      throw new Error("HTTP 503: All upstream backend servers are unavailable");
    }
    // Round-robin selection across healthy instances
    const selected = healthyServers[this.currentIndex % healthyServers.length];
    this.currentIndex = (this.currentIndex + 1) % healthyServers.length;
    selected.activeRequests++;
    return selected;
  }

  public reportStatus(id: string, healthy: boolean): void {
    const server = this.servers.find(s => s.id === id);
    if (server) {
      server.isHealthy = healthy;
    }
  }
}""",
            "tradeoffs": [
                ("Routing Layer", "L4 (Transport / TCP/UDP)", "L7 (Application / HTTP/gRPC)", "Raw packet throughput vs deep header inspection & cookie routing"),
                ("Algorithm", "Round Robin / Random", "Least Connections / Latency", "Zero state overhead vs optimal balancing during uneven task durations"),
                ("Session Affinity", "Sticky Sessions (Cookie-based)", "Stateless Token Architecture", "Cache locality benefits vs server hotspots and uneven node load"),
                ("Health Checking", "Passive (Traffic observation)", "Active (Periodic synthetic ping)", "Zero synthetic bandwidth vs delayed failure detection")
            ],
            "quiz": [
                {
                    "question": "What happens when an upstream server in a load balancer pool fails consecutive health checks?",
                    "options": [
                        ("The load balancer immediately marks it unhealthy and routes incoming requests only to surviving nodes.", True, "Active health checks prevent blackholing client traffic by immediately rerouting to healthy nodes."),
                        ("The load balancer halts all incoming traffic to prevent cluster inconsistencies.", False, "Halting all traffic causes a complete outage, which violates high availability."),
                        ("The load balancer retries the failed node infinitely without timeout.", False, "Infinite retries exhaust client connections and trigger cascading request timeouts.")
                    ]
                },
                {
                    "question": "Why is Layer 7 (L7) load balancing computationally more resource-intensive than Layer 4 (L4)?",
                    "options": [
                        ("L7 must fully parse HTTP headers, TLS handshakes, cookies, and URI paths before routing.", True, "L7 operates at the application layer, requiring TCP termination and full payload/header inspection."),
                        ("L7 operates purely on MAC addresses in kernel memory space.", False, "Layer 2 operates on MAC addresses; L7 operates on application protocols like HTTP and gRPC."),
                        ("L7 cannot use hardware acceleration under any circumstances.", False, "L7 can utilize TLS offloading chips, but payload parsing still requires substantial CPU cycles.")
                    ]
                }
            ],
            "takeaways": [
                "Always run load balancers in an Active-Passive or Anycast Active-Active pair to avoid single points of failure (SPOF).",
                "Prefer stateless application servers so any replica can handle any user request seamlessly.",
                "Tune connection timeouts and circuit breakers so slow upstreams are isolated before thread pools exhaust.",
                "Use L7 when microservices require path-based routing (/api vs /static) or JWT header inspection."
            ]
        }
    return None

profile = get_topic_profile("Load Balancers", "System Design", "Distributed Systems", "")
print("Loaded profile:", profile["category"], "with", len(profile["quiz"]), "quiz questions")
