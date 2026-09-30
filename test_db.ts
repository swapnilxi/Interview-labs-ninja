import { getSQLiteDatabase } from './frontend/src/lib/server/sqliteReader';
console.log(getSQLiteDatabase('lab_ninja')?.filePath);
