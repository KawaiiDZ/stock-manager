import socket
import json
import logging
import threading
import asyncio
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

DISCOVERY_UDP_PORT = 41234
MAGIC_DISCOVERY_PING = "STOKFLOW_DISCOVER"

_beacon_socket: Optional[socket.socket] = None
_beacon_thread: Optional[threading.Thread] = None
_beacon_stop_event = threading.Event()

def get_local_lan_ip() -> str:
    """
    Determine the primary local LAN IP address of this machine.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't actually make a network connection, just uses kernel routing table
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def _beacon_loop(lan_ip: str, http_port: int, station_name: str):
    global _beacon_socket
    try:
        _beacon_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        _beacon_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # Bind to all interfaces on DISCOVERY_UDP_PORT
        _beacon_socket.bind(("", DISCOVERY_UDP_PORT))
        _beacon_socket.settimeout(1.0)
        logger.info(f"UDP Discovery beacon listening on port {DISCOVERY_UDP_PORT}")
    except Exception as e:
        logger.warning(f"Failed to bind UDP discovery beacon socket: {e}")
        return

    while not _beacon_stop_event.is_set():
        try:
            data, addr = _beacon_socket.recvfrom(1024)
            msg = data.decode("utf-8", errors="ignore").strip()
            if msg == MAGIC_DISCOVERY_PING or "STOKFLOW" in msg:
                # Prepare response
                response = {
                    "service": "stokflow",
                    "station_name": station_name,
                    "ip": lan_ip,
                    "port": http_port,
                    "version": "1.0.0"
                }
                resp_bytes = json.dumps(response).encode("utf-8")
                _beacon_socket.sendto(resp_bytes, addr)
        except socket.timeout:
            continue
        except Exception as e:
            if not _beacon_stop_event.is_set():
                logger.debug(f"Beacon socket recv error: {e}")
            break

    try:
        if _beacon_socket:
            _beacon_socket.close()
    except Exception:
        pass
    _beacon_socket = None

def start_discovery_beacon(http_port: int = 8000, station_name: str = "Main Host Register"):
    """
    Start the background UDP discovery beacon so other terminals can find this host.
    """
    global _beacon_thread, _beacon_stop_event
    if _beacon_thread and _beacon_thread.is_alive():
        return

    _beacon_stop_event.clear()
    lan_ip = get_local_lan_ip()
    _beacon_thread = threading.Thread(
        target=_beacon_loop,
        args=(lan_ip, http_port, station_name),
        daemon=True,
        name="DiscoveryBeacon"
    )
    _beacon_thread.start()
    logger.info(f"Started discovery beacon thread for station '{station_name}' on {lan_ip}:{http_port}")

def stop_discovery_beacon():
    """
    Stop the background UDP discovery beacon.
    """
    global _beacon_thread, _beacon_stop_event, _beacon_socket
    _beacon_stop_event.set()
    if _beacon_socket:
        try:
            _beacon_socket.close()
        except Exception:
            pass
    if _beacon_thread:
        _beacon_thread.join(timeout=2.0)
        _beacon_thread = None
    logger.info("Discovery beacon stopped.")

def discover_hosts_udp(timeout: float = 1.5) -> List[Dict[str, Any]]:
    """
    Broadcast a UDP discovery packet on the LAN and collect responses.
    """
    hosts = []
    seen_ips = set()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.settimeout(timeout)

    try:
        message = MAGIC_DISCOVERY_PING.encode("utf-8")
        s.sendto(message, ("<broadcast>", DISCOVERY_UDP_PORT))

        while True:
            try:
                data, addr = s.recvfrom(2048)
                ip = addr[0]
                if ip in seen_ips:
                    continue
                try:
                    payload = json.loads(data.decode("utf-8"))
                    if payload.get("service") == "stokflow":
                        seen_ips.add(ip)
                        payload["discovered_ip"] = ip
                        payload["discovery_method"] = "udp"
                        payload["url"] = f"http://{ip}:{payload.get('port', 8000)}"
                        hosts.append(payload)
                except json.JSONDecodeError:
                    pass
            except socket.timeout:
                break
    except Exception as e:
        logger.warning(f"Error during UDP discovery broadcast: {e}")
    finally:
        s.close()

    return hosts

async def probe_ip_http(ip: str, port: int = 8000, client: Optional[httpx.AsyncClient] = None) -> Optional[Dict[str, Any]]:
    """
    Probe a specific IP over HTTP /api/network/ping with a short timeout.
    """
    url = f"http://{ip}:{port}/api/network/ping"
    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=0.4)
        close_client = True

    try:
        resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("service") == "stokflow":
                data["discovered_ip"] = ip
                data["discovery_method"] = "subnet_probe"
                data["url"] = f"http://{ip}:{port}"
                return data
    except Exception:
        pass
    finally:
        if close_client:
            await client.aclose()
    return None

async def scan_subnet_http(port: int = 8000, max_concurrent: int = 50) -> List[Dict[str, Any]]:
    """
    Scan the local /24 subnet for StockFlow instances as fallback if UDP broadcast is blocked.
    """
    local_ip = get_local_lan_ip()
    parts = local_ip.split(".")
    if len(parts) != 4 or local_ip == "127.0.0.1":
        return []

    subnet_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
    candidates = [f"{subnet_prefix}.{i}" for i in range(1, 255)]

    found_hosts = []
    sem = asyncio.Semaphore(max_concurrent)

    async with httpx.AsyncClient(timeout=0.5) as client:
        async def task(ip):
            async with sem:
                res = await probe_ip_http(ip, port=port, client=client)
                if res:
                    found_hosts.append(res)

        await asyncio.gather(*(task(ip) for ip in candidates), return_exceptions=True)

    return found_hosts

async def scan_network(timeout: float = 1.5, run_subnet_fallback: bool = True) -> List[Dict[str, Any]]:
    """
    Discover StockFlow instances on the network using UDP broadcast first,
    falling back or supplementing with fast subnet probe.
    """
    loop = asyncio.get_event_loop()
    # 1. UDP Broadcast in thread
    udp_results = await loop.run_in_executor(None, discover_hosts_udp, timeout)

    known_ips = {h["discovered_ip"] for h in udp_results}

    # 2. If UDP found results, or if subnet fallback requested
    subnet_results = []
    if run_subnet_fallback:
        # Fast subnet probe
        subnet_results = await scan_subnet_http(port=8000)

    combined = list(udp_results)
    for res in subnet_results:
        if res["discovered_ip"] not in known_ips:
            combined.append(res)
            known_ips.add(res["discovered_ip"])

    return combined

async def check_remote_host(base_url: str) -> Dict[str, Any]:
    """
    Verify if a remote host URL is running StockFlow and reachable.
    """
    # Clean base url
    clean_url = base_url.rstrip("/")
    ping_url = f"{clean_url}/api/network/ping"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(ping_url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("service") == "stokflow":
                    return {
                        "reachable": True,
                        "station_name": data.get("station_name", "Remote Host"),
                        "version": data.get("version", "1.0.0"),
                        "url": clean_url,
                        "message": "Connected successfully"
                    }
            return {
                "reachable": False,
                "url": clean_url,
                "message": f"Server responded with HTTP {resp.status_code}, but is not a StockFlow instance."
            }
    except Exception as e:
        return {
            "reachable": False,
            "url": clean_url,
            "message": f"Could not connect: {str(e)}"
        }
