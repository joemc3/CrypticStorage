import React from 'react';
import { Link } from 'react-router-dom';
import { LockClosedIcon, ShieldCheckIcon, CloudArrowUpIcon, KeyIcon } from '@heroicons/react/24/outline';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6">
            <span className="text-gradient">CrypticStorage</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Zero-Knowledge Encrypted File Storage
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
            Your files are encrypted on your device before upload. We can't access your data - only you can.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn btn-primary text-lg px-8 py-3">
              Get Started Free
            </Link>
            <Link to="/login" className="btn btn-outline text-lg px-8 py-3">
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <LockClosedIcon className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">End-to-End Encryption</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Files encrypted with AES-256-GCM before leaving your device
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <ShieldCheckIcon className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Zero-Knowledge</h3>
            <p className="text-gray-600 dark:text-gray-400">
              We never see your encryption keys or unencrypted data
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <CloudArrowUpIcon className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Secure Upload</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Fast, secure uploads with client-side encryption
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <KeyIcon className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Your Keys Only</h3>
            <p className="text-gray-600 dark:text-gray-400">
              You control your encryption keys, not us
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
