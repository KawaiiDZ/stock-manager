from fastapi import HTTPException, status

class BusinessRuleException(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail=detail)

class InsufficientStockException(BusinessRuleException):
    def __init__(self, product_name: str, available: float, requested: float):
        detail = f"Not enough stock. Only {available:g} units of {product_name} are available."
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)

class DuplicateBarcodeException(BusinessRuleException):
    def __init__(self, barcode: str, product_name: str = ""):
        if product_name:
            detail = f"Barcode '{barcode}' is already assigned to '{product_name}'."
        else:
            detail = f"This barcode is already assigned to another product."
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)

class EntityNotFoundException(BusinessRuleException):
    def __init__(self, entity_name: str, identifier: str = ""):
        if identifier:
            detail = f"{entity_name} ({identifier}) was not found."
        else:
            detail = f"{entity_name} was not found."
        super().__init__(detail=detail, status_code=status.HTTP_404_NOT_FOUND)

class InvalidFinancialStateException(BusinessRuleException):
    def __init__(self, detail: str):
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)
