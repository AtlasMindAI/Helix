# A mock dependency chain to test deep Blast Radius

def system_core_util():
    pass

def secondary_service():
    system_core_util()

def business_logic_layer():
    secondary_service()

def api_endpoint():
    business_logic_layer()

def frontend_component():
    api_endpoint()

