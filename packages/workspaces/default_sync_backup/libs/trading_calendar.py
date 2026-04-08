"""Trading calendar utility for A-shares."""

from datetime import date, datetime
import holidays


def is_trading_day(target_date: date = None) -> bool:
    """Check if the given date is a trading day in A-share market.
    
    A-share trading days are Monday to Friday, excluding public holidays.
    """
    if target_date is None:
        target_date = date.today()

    # Weekends
    if target_date.weekday() >= 5:
        return False

    # A-share (China) holidays
    # Note: This is a simplified version. In production, we'd use a more accurate
    # source for exchange-specific holidays.
    cn_holidays = holidays.China()
    if target_date in cn_holidays:
        return False

    return True


def get_next_trading_day(start_date: date = None) -> date:
    """Find the next trading day."""
    if start_date is None:
        start_date = date.today()
    
    curr = start_date
    while True:
        curr = curr.replace(day=curr.day + 1)
        if is_trading_day(curr):
            return curr
