"""Example script demonstrating Kafka producer and consumer with Pydantic schemas."""

import asyncio
import random
from datetime import datetime
from uuid import uuid4

from libs.mq.kafka_client import TOPIC_MARKET_QUOTES_REALTIME, TOPIC_AGENT_TASKS, TOPIC_AGENT_RESULTS, get_kafka
from libs.schemas.kafka_schemas import MarketQuoteRealtime, AgentTask, AgentResult

async def produce_quotes():
    """Simulate producing real-time market quotes."""
    kafka = get_kafka()
    await kafka.start_producer()
    
    stocks = ["600519.SH", "000001.SZ", "300750.SZ"]
    
    print(f"Producing quotes to {TOPIC_MARKET_QUOTES_REALTIME}...")
    for _ in range(5):
        stock = random.choice(stocks)
        quote = MarketQuoteRealtime(
            stock_code=stock,
            price=random.uniform(10, 2000),
            open=random.uniform(10, 2000),
            high=random.uniform(10, 2000),
            low=random.uniform(10, 2000),
            volume=random.uniform(1000, 100000),
            amount=random.uniform(10000, 1000000),
            last_close=random.uniform(10, 2000),
            change_pct=random.uniform(-10, 10),
            trade_time=datetime.now()
        )
        
        # We use stock_code as the key to ensure same stock goes to the same partition
        await kafka.send(TOPIC_MARKET_QUOTES_REALTIME, value=quote, key=stock)
        print(f"Sent quote for {stock}: {quote.price:.2f}")
        await asyncio.sleep(1)

async def consume_quotes():
    """Simulate consuming real-time market quotes."""
    kafka = get_kafka()
    consumer = await kafka.create_consumer(TOPIC_MARKET_QUOTES_REALTIME, group_id="demo-consumer-group")
    
    print(f"Consuming quotes from {TOPIC_MARKET_QUOTES_REALTIME}...")
    try:
        async for msg in consumer:
            # Reconstruct Pydantic model
            data = msg.value
            quote = MarketQuoteRealtime(**data)
            print(f"Received quote: {quote.stock_code} at {quote.price:.2f} (Time: {quote.trade_time})")
            
            # Consume 3 messages then stop for the demo
            if random.random() < 0.3:
                 break
    finally:
        await consumer.stop()

async def produce_task_and_result():
    """Demonstrate agent task distribution and result reporting."""
    kafka = get_kafka()
    await kafka.start_producer()
    
    task_id = str(uuid4())
    task = AgentTask(
        task_id=task_id,
        agent_type="technical",
        stock_code="600519.SH",
        priority=5,
        params={"indicators": ["MA", "RSI"]}
    )
    
    print(f"Sending task {task_id}...")
    await kafka.send(TOPIC_AGENT_TASKS, value=task)
    
    # Simulate agent work
    await asyncio.sleep(2)
    
    result = AgentResult(
        task_id=task_id,
        agent_type="technical",
        stock_code="600519.SH",
        status="success",
        result_data={"recommendation": "BUY", "confidence": 0.85},
        execution_time_ms=125.5
    )
    
    print(f"Sending result for task {task_id}...")
    await kafka.send(TOPIC_AGENT_RESULTS, value=result)

async def main():
    # Run producer and consumer concurrently
    # Note: In a real app, these would be separate processes
    print("=== Kafka Pydantic Demo ===")
    
    # Producer
    await produce_quotes()
    await produce_task_and_result()
    
    # Consumer
    await consume_quotes()
    
    # Clean up
    await get_kafka().close()
    print("Demo completed.")

if __name__ == "__main__":
    asyncio.run(main())
