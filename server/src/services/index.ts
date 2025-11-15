/**
 * Service Layer Index
 * Exports all services for easy importing throughout the application
 */

// Import all services
import * as authService from './auth.service';
import * as fileService from './file.service';
import * as folderService from './folder.service';
import * as shareService from './share.service';
import * as auditService from './audit.service';
import * as storageService from './storage.service';

// Export all services
export {
  authService,
  fileService,
  folderService,
  shareService,
  auditService,
  storageService,
};

// Export default object with all services
export default {
  auth: authService,
  file: fileService,
  folder: folderService,
  share: shareService,
  audit: auditService,
  storage: storageService,
};
