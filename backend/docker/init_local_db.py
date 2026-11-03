"""Initialize the local Compose database; never used by Azure deployments."""
import os

import pyodbc


connection = pyodbc.connect(
    "DRIVER={ODBC Driver 18 for SQL Server};SERVER=db,1433;DATABASE=master;"
    "UID=sa;PWD=" + os.environ["MSSQL_SA_PASSWORD"] + ";Encrypt=yes;TrustServerCertificate=yes;",
    autocommit=True,
    timeout=10,
)
try:
    cursor = connection.cursor()
    if not cursor.execute("SELECT DB_ID(N'SQLUIT')").fetchval():
        cursor.execute("CREATE DATABASE [SQLUIT]")
        print("Created local SQLUIT database.")
    else:
        print("Local SQLUIT database already exists.")
finally:
    connection.close()
