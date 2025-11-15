import React from 'react';
import {
  DocumentIcon,
  CloudArrowUpIcon,
  ShareIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent } from '../common/Card';
import { Spinner } from '../common/Spinner';
import { motion } from 'framer-motion';

export interface StatCard {
  id: string;
  label: string;
  value: string | number;
  change?: number; // Percentage change
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'indigo';
}

export interface QuickStatsProps {
  stats?: StatCard[];
  isLoading?: boolean;
  variant?: 'default' | 'compact';
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    icon: 'text-blue-500',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-600 dark:text-green-400',
    icon: 'text-green-500',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-600 dark:text-purple-400',
    icon: 'text-purple-500',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-600 dark:text-orange-400',
    icon: 'text-orange-500',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    icon: 'text-indigo-500',
  },
};

const defaultStats: StatCard[] = [
  {
    id: 'total-files',
    label: 'Total Files',
    value: '0',
    icon: DocumentIcon,
    color: 'blue',
  },
  {
    id: 'total-uploads',
    label: 'Total Uploads',
    value: '0',
    icon: CloudArrowUpIcon,
    color: 'green',
  },
  {
    id: 'shared-files',
    label: 'Shared Files',
    value: '0',
    icon: ShareIcon,
    color: 'purple',
  },
];

export const QuickStats: React.FC<QuickStatsProps> = ({
  stats = defaultStats,
  isLoading = false,
  variant = 'default',
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} variant="bordered">
            <CardContent className="p-6">
              <div className="flex items-center justify-center h-20">
                <Spinner size="md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const colors = colorClasses[stat.color];

          return (
            <motion.div
              key={stat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card variant="bordered" className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {stat.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                        {stat.value}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg ${colors.bg}`}>
                      <Icon className={`h-6 w-6 ${colors.icon}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    );
  }

  // Default variant
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const colors = colorClasses[stat.color];
        const hasIncrease = stat.change !== undefined && stat.change > 0;
        const hasDecrease = stat.change !== undefined && stat.change < 0;

        return (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card variant="bordered" hoverable>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {stat.value}
                    </p>

                    {/* Change Indicator */}
                    {stat.change !== undefined && (
                      <div className="flex items-center gap-1 mt-2">
                        {hasIncrease ? (
                          <>
                            <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                              +{Math.abs(stat.change)}%
                            </span>
                          </>
                        ) : hasDecrease ? (
                          <>
                            <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                              {stat.change}%
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            No change
                          </span>
                        )}
                        {stat.changeLabel && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {stat.changeLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Icon */}
                  <div className={`p-3 rounded-lg ${colors.bg}`}>
                    <Icon className={`h-8 w-8 ${colors.icon}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};

// Helper hook for creating stat cards
export const useQuickStats = (data: {
  totalFiles?: number;
  totalUploads?: number;
  sharedFiles?: number;
  storageUsed?: number;
  previousPeriodFiles?: number;
  previousPeriodUploads?: number;
}): StatCard[] => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const stats: StatCard[] = [];

  if (data.totalFiles !== undefined) {
    stats.push({
      id: 'total-files',
      label: 'Total Files',
      value: data.totalFiles.toLocaleString(),
      change:
        data.previousPeriodFiles !== undefined
          ? calculateChange(data.totalFiles, data.previousPeriodFiles)
          : undefined,
      changeLabel: 'from last month',
      icon: DocumentIcon,
      color: 'blue',
    });
  }

  if (data.totalUploads !== undefined) {
    stats.push({
      id: 'total-uploads',
      label: 'Total Uploads',
      value: data.totalUploads.toLocaleString(),
      change:
        data.previousPeriodUploads !== undefined
          ? calculateChange(data.totalUploads, data.previousPeriodUploads)
          : undefined,
      changeLabel: 'from last month',
      icon: CloudArrowUpIcon,
      color: 'green',
    });
  }

  if (data.sharedFiles !== undefined) {
    stats.push({
      id: 'shared-files',
      label: 'Shared Files',
      value: data.sharedFiles.toLocaleString(),
      icon: ShareIcon,
      color: 'purple',
    });
  }

  if (data.storageUsed !== undefined) {
    stats.push({
      id: 'storage-used',
      label: 'Storage Used',
      value: formatBytes(data.storageUsed),
      icon: CloudArrowUpIcon,
      color: 'indigo',
    });
  }

  return stats;
};
