import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../common/Card';
import { motion } from 'framer-motion';

export interface StorageData {
  used: number; // in bytes
  total: number; // in bytes
  breakdown?: {
    images: number;
    videos: number;
    documents: number;
    audio: number;
    other: number;
  };
}

export interface StorageChartProps {
  data: StorageData;
  variant?: 'pie' | 'bar' | 'simple';
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const COLORS = {
  images: '#3B82F6', // blue
  videos: '#8B5CF6', // purple
  documents: '#EF4444', // red
  audio: '#10B981', // green
  other: '#F59E0B', // yellow
  used: '#4F46E5', // indigo
  available: '#E5E7EB', // gray
};

export const StorageChart: React.FC<StorageChartProps> = ({ data, variant = 'pie' }) => {
  const usedPercentage = (data.used / data.total) * 100;
  const available = data.total - data.used;

  const pieData = data.breakdown
    ? [
        { name: 'Images', value: data.breakdown.images, color: COLORS.images },
        { name: 'Videos', value: data.breakdown.videos, color: COLORS.videos },
        { name: 'Documents', value: data.breakdown.documents, color: COLORS.documents },
        { name: 'Audio', value: data.breakdown.audio, color: COLORS.audio },
        { name: 'Other', value: data.breakdown.other, color: COLORS.other },
      ].filter((item) => item.value > 0)
    : [
        { name: 'Used', value: data.used, color: COLORS.used },
        { name: 'Available', value: available, color: COLORS.available },
      ];

  const barData = data.breakdown
    ? [
        { name: 'Images', size: data.breakdown.images },
        { name: 'Videos', size: data.breakdown.videos },
        { name: 'Documents', size: data.breakdown.documents },
        { name: 'Audio', size: data.breakdown.audio },
        { name: 'Other', size: data.breakdown.other },
      ].filter((item) => item.size > 0)
    : [];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{payload[0].name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {formatBytes(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (variant === 'simple') {
    return (
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
          <CardDescription>
            {formatBytes(data.used)} of {formatBytes(data.total)} used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="relative">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    usedPercentage > 90
                      ? 'bg-red-500'
                      : usedPercentage > 75
                      ? 'bg-yellow-500'
                      : 'bg-indigo-600'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${usedPercentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Used</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatBytes(data.used)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 dark:text-gray-400">Available</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatBytes(available)}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            {data.breakdown && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Storage Breakdown
                </p>
                <div className="space-y-2">
                  {Object.entries(data.breakdown).map(([type, size]) => {
                    if (size === 0) return null;
                    const percentage = (size / data.used) * 100;
                    return (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: COLORS[type as keyof typeof COLORS],
                            }}
                          />
                          <span className="text-gray-700 dark:text-gray-300 capitalize">{type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-gray-400">
                            {percentage.toFixed(1)}%
                          </span>
                          <span className="text-gray-900 dark:text-gray-100 font-medium">
                            {formatBytes(size)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'bar') {
    return (
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Storage by Type</CardTitle>
          <CardDescription>Distribution of storage across file types</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="name"
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
                tickFormatter={(value) => formatBytes(value)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="size" radius={[8, 8, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // Pie chart (default)
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Storage Overview</CardTitle>
        <CardDescription>
          {formatBytes(data.used)} of {formatBytes(data.total)} used ({usedPercentage.toFixed(1)}%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry: any) => (
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {value} ({formatBytes(entry.payload.value)})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
