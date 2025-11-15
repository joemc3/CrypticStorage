import React, { useState } from 'react';
import {
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { FileItem, FileItemProps } from './FileItem';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Spinner } from '../common/Spinner';
import { motion, AnimatePresence } from 'framer-motion';

export interface FileListProps {
  files: FileItemProps[];
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  isLoading?: boolean;
  emptyMessage?: string;
  onFileClick?: (fileId: string) => void;
  onFileDownload?: (fileId: string) => void;
  onFileDelete?: (fileId: string) => void;
  onFileShare?: (fileId: string) => void;
}

type SortField = 'name' | 'size' | 'date';
type SortOrder = 'asc' | 'desc';

export const FileList: React.FC<FileListProps> = ({
  files,
  viewMode: controlledViewMode,
  onViewModeChange,
  isLoading = false,
  emptyMessage = 'No files found',
  onFileClick,
  onFileDownload,
  onFileDelete,
  onFileShare,
}) => {
  const [internalViewMode, setInternalViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const viewMode = controlledViewMode ?? internalViewMode;

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter and sort files
  const filteredAndSortedFiles = React.useMemo(() => {
    let result = [...files];

    // Filter by search query
    if (searchQuery) {
      result = result.filter((file) =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort files
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [files, searchQuery, sortField, sortOrder]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading files..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 w-full sm:w-auto">
          <Input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Sort & Filter */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            leftIcon={<FunnelIcon className="h-4 w-4" />}
          >
            Filters
          </Button>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={`p-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <ListBulletIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sort Options */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Sort by:</span>
            {(['name', 'size', 'date'] as SortField[]).map((field) => (
              <Button
                key={field}
                variant={sortField === field ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handleSort(field)}
              >
                {field.charAt(0).toUpperCase() + field.slice(1)}
                {sortField === field && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {filteredAndSortedFiles.length} {filteredAndSortedFiles.length === 1 ? 'file' : 'files'}
        {searchQuery && ` matching "${searchQuery}"`}
      </div>

      {/* Files Grid/List */}
      {filteredAndSortedFiles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </motion.div>
      ) : (
        <motion.div
          layout
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-2'
          }
        >
          <AnimatePresence mode="popLayout">
            {filteredAndSortedFiles.map((file) => (
              <motion.div
                key={file.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <FileItem
                  {...file}
                  viewMode={viewMode}
                  onClick={() => onFileClick?.(file.id)}
                  onDownload={() => onFileDownload?.(file.id)}
                  onDelete={() => onFileDelete?.(file.id)}
                  onShare={() => onFileShare?.(file.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};
