"""Kafka administrative utility for topic management."""

import argparse
import sys
from typing import List

from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError

from configs.settings import get_settings

def get_admin_client() -> KafkaAdminClient:
    settings = get_settings()
    return KafkaAdminClient(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        client_id='ai_stock_admin'
    )

def create_topics():
    """Create project core topics with defined retention and partitions."""
    admin_client = get_admin_client()
    
    # Define topics based on requirements
    # market.quotes.realtime: 7 days
    # market.kline.daily: 30 days
    # news.financial: 90 days
    # agent.tasks: 7 days
    # agent.results: 30 days
    
    topics = [
        ("market.quotes.realtime", 3, 7),
        ("market.kline.daily", 3, 30),
        ("news.financial", 3, 90),
        ("agent.tasks", 3, 7),
        ("agent.results", 3, 30),
    ]
    
    new_topics = []
    for name, partitions, retention_days in topics:
        retention_ms = retention_days * 24 * 60 * 60 * 1000
        new_topics.append(NewTopic(
            name=name,
            num_partitions=partitions,
            replication_factor=1, # Single broker setup
            topic_configs={'retention.ms': str(retention_ms)}
        ))

    try:
        admin_client.create_topics(new_topics=new_topics, validate_only=False)
        print(f"Successfully created topics: {[t[0] for t in topics]}")
    except TopicAlreadyExistsError:
        print("Some topics already exist. Use 'list' to verify.")
    except Exception as e:
        print(f"Error creating topics: {e}")
    finally:
        admin_client.close()

def list_topics():
    """List all topics and their configuration."""
    admin_client = get_admin_client()
    try:
        topics = admin_client.list_topics()
        print("Kafka Topics:")
        for topic in sorted(topics):
            if not topic.startswith("__"): # Filter internal topics
                print(f" - {topic}")
    finally:
        admin_client.close()

def delete_topics(topic_names: List[str]):
    """Delete specified topics."""
    admin_client = get_admin_client()
    try:
        admin_client.delete_topics(topics=topic_names)
        print(f"Successfully deleted topics: {topic_names}")
    except Exception as e:
        print(f"Error deleting topics: {e}")
    finally:
        admin_client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kafka Admin Tool")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    subparsers.add_parser("create", help="Create core topics")
    subparsers.add_parser("list", help="List topics")
    
    delete_parser = subparsers.add_parser("delete", help="Delete topics")
    delete_parser.add_argument("topics", nargs="+", help="Topic names to delete")

    args = parser.parse_args()

    if args.command == "create":
        create_topics()
    elif args.command == "list":
        list_topics()
    elif args.command == "delete":
        delete_topics(args.topics)
    else:
        parser.print_help()
