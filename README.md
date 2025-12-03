# SupermarketAppMVC — Local Setup

This project uses MySQL. Follow these steps to set up the database and run the app locally.

1. Install and start MySQL server on Windows. Common service name: `MySQL80`.

2. Create the database and app user (recommended):

- Open PowerShell and run the MySQL client as `root`:
```powershell
mysql -u root -p
```
- In the MySQL prompt, run the commands in `db/init.sql` or copy/paste:
```sql
CREATE DATABASE IF NOT EXISTS supermarket_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS 'appuser'@'localhost' IDENTIFIED BY 'StrongAppPass123!';
GRANT ALL PRIVILEGES ON supermarket_db.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
```

3. Update `.env` in the project root with the DB credentials. Example:
```
DB_HOST=localhost
DB_USER=appuser
DB_PASSWORD=StrongAppPass123!
DB_NAME=supermarket_db
```

4. Install dependencies and run the app:
```powershell
npm install
node app.js
```

5. If you cannot log in as `root` and must reset the root password, follow MySQL's official docs or ask me and I can provide step-by-step guidance (this requires stopping the service and starting MySQL temporarily with `--skip-grant-tables`).

If you run into any errors, copy the terminal output here and I will help troubleshoot.
