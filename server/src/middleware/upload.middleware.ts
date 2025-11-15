import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { PayloadTooLargeError, BadRequestError } from './error.middleware';

/**
 * File upload configuration
 */
const UPLOAD_CONFIG = {
  // Maximum file size (5GB)
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '5368709120', 10),

  // Maximum number of files per upload
  MAX_FILES: parseInt(process.env.MAX_FILES_PER_UPLOAD || '10', 10),

  // Allowed file extensions (empty = all allowed)
  ALLOWED_EXTENSIONS: process.env.ALLOWED_FILE_EXTENSIONS
    ? process.env.ALLOWED_FILE_EXTENSIONS.split(',')
    : [],

  // Blocked file extensions (security)
  BLOCKED_EXTENSIONS: [
    '.exe',
    '.bat',
    '.cmd',
    '.com',
    '.pif',
    '.scr',
    '.vbs',
    '.js',
    '.jar',
    '.sh',
    '.app',
  ],

  // Allowed MIME types (empty = all allowed)
  ALLOWED_MIME_TYPES: process.env.ALLOWED_MIME_TYPES
    ? process.env.ALLOWED_MIME_TYPES.split(',')
    : [],

  // Blocked MIME types
  BLOCKED_MIME_TYPES: [
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
  ],
};

/**
 * Memory storage engine
 * Files are stored in memory as Buffer objects
 * Suitable for encrypted files that will be uploaded to object storage
 */
const memoryStorage: StorageEngine = multer.memoryStorage();

/**
 * Disk storage engine (for temporary storage)
 * Files are stored on disk temporarily before processing
 */
const diskStorage: StorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use temp directory from environment or default to /tmp
    const tempDir = process.env.UPLOAD_TEMP_DIR || '/tmp/crypticstorage';
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    const fileName = `${uniqueId}${ext}`;
    cb(null, fileName);
  },
});

/**
 * File filter function
 * Validates file type and extension
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  try {
    // Get file extension
    const ext = path.extname(file.originalname).toLowerCase();

    // Check blocked extensions
    if (UPLOAD_CONFIG.BLOCKED_EXTENSIONS.includes(ext)) {
      cb(
        new BadRequestError(
          `File type '${ext}' is not allowed for security reasons`
        )
      );
      return;
    }

    // Check blocked MIME types
    if (UPLOAD_CONFIG.BLOCKED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestError(
          `MIME type '${file.mimetype}' is not allowed for security reasons`
        )
      );
      return;
    }

    // Check allowed extensions (if specified)
    if (
      UPLOAD_CONFIG.ALLOWED_EXTENSIONS.length > 0 &&
      !UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(ext)
    ) {
      cb(
        new BadRequestError(
          `File type '${ext}' is not allowed. Allowed types: ${UPLOAD_CONFIG.ALLOWED_EXTENSIONS.join(', ')}`
        )
      );
      return;
    }

    // Check allowed MIME types (if specified)
    if (
      UPLOAD_CONFIG.ALLOWED_MIME_TYPES.length > 0 &&
      !UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)
    ) {
      cb(
        new BadRequestError(
          `MIME type '${file.mimetype}' is not allowed. Allowed types: ${UPLOAD_CONFIG.ALLOWED_MIME_TYPES.join(', ')}`
        )
      );
      return;
    }

    // File is valid
    cb(null, true);
  } catch (error) {
    cb(error as Error);
  }
};

/**
 * Memory storage upload handler (default)
 * Files are stored in memory as Buffer objects
 */
export const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
    files: UPLOAD_CONFIG.MAX_FILES,
    fields: 20, // Max number of non-file fields
    fieldSize: 1024 * 1024, // 1MB per field
    fieldNameSize: 100, // Max field name size
  },
  fileFilter,
});

/**
 * Disk storage upload handler
 * Files are temporarily stored on disk
 */
export const uploadDisk = multer({
  storage: diskStorage,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
    files: UPLOAD_CONFIG.MAX_FILES,
    fields: 20,
    fieldSize: 1024 * 1024,
    fieldNameSize: 100,
  },
  fileFilter,
});

/**
 * Single file upload middleware (memory storage)
 */
export const uploadSingleFile = uploadMemory.single('file');

/**
 * Multiple files upload middleware (memory storage)
 */
export const uploadMultipleFiles = uploadMemory.array(
  'files',
  UPLOAD_CONFIG.MAX_FILES
);

/**
 * Multiple files with different field names (memory storage)
 */
export const uploadFields = uploadMemory.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

/**
 * Single file upload middleware (disk storage)
 */
export const uploadSingleFileToDisk = uploadDisk.single('file');

/**
 * Multiple files upload middleware (disk storage)
 */
export const uploadMultipleFilesToDisk = uploadDisk.array(
  'files',
  UPLOAD_CONFIG.MAX_FILES
);

/**
 * Validate file size after upload
 * Useful for additional checks beyond Multer's built-in limits
 */
export const validateFileSize = (
  req: Request,
  maxSize: number = UPLOAD_CONFIG.MAX_FILE_SIZE
): void => {
  const file = req.file;
  const files = req.files;

  if (file && file.size > maxSize) {
    throw new PayloadTooLargeError(
      `File size ${formatBytes(file.size)} exceeds maximum allowed size of ${formatBytes(maxSize)}`
    );
  }

  if (Array.isArray(files)) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > maxSize) {
      throw new PayloadTooLargeError(
        `Total file size ${formatBytes(totalSize)} exceeds maximum allowed size of ${formatBytes(maxSize)}`
      );
    }
  }
};

/**
 * Validate file exists in request
 */
export const requireFile = (req: Request): void => {
  if (!req.file && !req.files) {
    throw new BadRequestError('No file uploaded');
  }

  if (req.file && req.file.size === 0) {
    throw new BadRequestError('Uploaded file is empty');
  }

  if (Array.isArray(req.files) && req.files.some((f) => f.size === 0)) {
    throw new BadRequestError('One or more uploaded files are empty');
  }
};

/**
 * Validate file name
 */
export const validateFileName = (fileName: string): void => {
  // Check length
  if (fileName.length === 0) {
    throw new BadRequestError('File name cannot be empty');
  }

  if (fileName.length > 255) {
    throw new BadRequestError('File name is too long (max 255 characters)');
  }

  // Check for invalid characters
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(fileName)) {
    throw new BadRequestError(
      'File name contains invalid characters: < > : " / \\ | ? *'
    );
  }

  // Check for reserved names (Windows)
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];

  const nameWithoutExt = path.parse(fileName).name.toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    throw new BadRequestError(`File name '${fileName}' is reserved`);
  }

  // Check for hidden files (starting with .)
  if (fileName.startsWith('.')) {
    throw new BadRequestError('Hidden files are not allowed');
  }
};

/**
 * Get file extension
 */
export const getFileExtension = (fileName: string): string => {
  return path.extname(fileName).toLowerCase();
};

/**
 * Get file name without extension
 */
export const getFileNameWithoutExtension = (fileName: string): string => {
  return path.parse(fileName).name;
};

/**
 * Sanitize file name
 * Removes invalid characters and normalizes the name
 */
export const sanitizeFileName = (fileName: string): string => {
  // Remove invalid characters
  let sanitized = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');

  // Replace spaces with underscores
  sanitized = sanitized.replace(/\s+/g, '_');

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

  // Ensure name is not empty
  if (sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const nameWithoutExt = sanitized.substring(0, 255 - ext.length);
    sanitized = nameWithoutExt + ext;
  }

  return sanitized;
};

/**
 * Format bytes to human-readable string
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Get MIME type from file extension
 */
export const getMimeTypeFromExtension = (extension: string): string => {
  const mimeTypes: { [key: string]: string } = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',

    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',

    // Archives
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',

    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',

    // Video
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',

    // Code
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
  };

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
};

/**
 * Check if file is an image
 */
export const isImageFile = (mimeType: string): boolean => {
  return mimeType.startsWith('image/');
};

/**
 * Check if file is a video
 */
export const isVideoFile = (mimeType: string): boolean => {
  return mimeType.startsWith('video/');
};

/**
 * Check if file is audio
 */
export const isAudioFile = (mimeType: string): boolean => {
  return mimeType.startsWith('audio/');
};

/**
 * Check if file is a document
 */
export const isDocumentFile = (mimeType: string): boolean => {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'text/plain',
    'text/csv',
  ];

  return documentTypes.some((type) => mimeType.includes(type));
};
