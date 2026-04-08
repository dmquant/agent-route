#!/usr/bin/env python3
"""Wait for all infrastructure services to be healthy before proceeding.

Usage: python scripts/wait_for_services.py [--timeout 60]
"""

import argparse
import socket
import sys
import time


SERVICES = [
    ("PostgreSQL", "localhost", 5432),
    ("Redis", "localhost", 6379),
    ("Kafka", "localhost", 9092),
]


def check_port(host: str, port: int, timeout: float = 1.0) -> bool:
    """Check if a TCP port is accepting connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Wait for infrastructure services")
    parser.add_argument("--timeout", type=int, default=60, help="Max wait time in seconds")
    args = parser.parse_args()

    deadline = time.time() + args.timeout
    pending = list(SERVICES)

    print(f"Waiting for {len(pending)} services (timeout: {args.timeout}s)...")

    while pending and time.time() < deadline:
        still_waiting = []
        for name, host, port in pending:
            if check_port(host, port):
                print(f"  ✓ {name} ({host}:{port}) is ready")
            else:
                still_waiting.append((name, host, port))
        pending = still_waiting

        if pending:
            time.sleep(2)

    if pending:
        print("\nFailed services:")
        for name, host, port in pending:
            print(f"  ✗ {name} ({host}:{port}) not reachable")
        sys.exit(1)

    print("\nAll services are ready!")


if __name__ == "__main__":
    main()
