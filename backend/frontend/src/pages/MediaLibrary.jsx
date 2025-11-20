import { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../services/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function MediaLibrary() {
  const [mediaFiles, setMediaFiles] = useState([]);
  const [whatsappNumbers, setWhatsappNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedNumberId, setSelectedNumberId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');
  const [filterNumberId, setFilterNumberId] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch WhatsApp numbers for dropdown
  useEffect(() => {
    fetchWhatsAppNumbers();
  }, []);

  // Fetch media library
  useEffect(() => {
    fetchMediaLibrary();
  }, [filterNumberId]);

  const fetchWhatsAppNumbers = async () => {
    try {
      const response = await api.get('/whatsapp-numbers');
      setWhatsappNumbers(response.data.data || []);
    } catch (err) {
      console.error('Error fetching WhatsApp numbers:', err);
    }
  };

  const fetchMediaLibrary = async () => {
    try {
      setLoading(true);

      const url = filterNumberId === 'all'
        ? '/media/library'
        : `/media/library/${filterNumberId}`;

      const response = await api.get(url);

      setMediaFiles(response.data.media || []);
      setError('');
    } catch (err) {
      console.error('Error fetching media library:', err);
      setError('Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (16 MB limit for videos)
      if (file.size > 16 * 1024 * 1024) {
        setError('File size must be less than 16 MB');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!selectedNumberId) {
      setError('Please select a WhatsApp number');
      return;
    }

    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    try {
      setUploading(true);
      setError('');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('whatsapp_number_id', selectedNumberId);
      formData.append('description', description);

      await api.post('/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setSuccess('Media uploaded successfully!');
      setSelectedFile(null);
      setDescription('');

      // Reset file input
      document.getElementById('file-input').value = '';

      // Refresh media library
      fetchMediaLibrary();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to upload media');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (mediaId) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    try {
      await api.delete(`/media/library/${mediaId}`);

      setSuccess('Media deleted successfully');
      fetchMediaLibrary();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete media');
    }
  };

  const copyMediaId = (mediaId) => {
    navigator.clipboard.writeText(mediaId);
    setSuccess('Media ID copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const filteredMedia = filterType === 'all'
    ? mediaFiles
    : mediaFiles.filter(m => m.file_type === filterType);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Media Library</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload media files to WhatsApp and manage your media library. Use Media IDs in campaigns instead of URLs.
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload New Media</h2>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              WhatsApp Number *
            </label>
            <select
              value={selectedNumberId}
              onChange={(e) => setSelectedNumberId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select WhatsApp Number</option>
              {whatsappNumbers.map((num) => (
                <option key={num.id} value={num.id}>
                  {num.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File * (Max 16 MB)
            </label>
            <input
              id="file-input"
              type="file"
              onChange={handleFileChange}
              accept="video/*,image/*,audio/*,.pdf,.doc,.docx"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Promo Video Q1 2025"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload to WhatsApp'}
          </button>
        </form>
      </div>

      {/* Filter Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Filter Media</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              WhatsApp Number
            </label>
            <select
              value={filterNumberId}
              onChange={(e) => setFilterNumberId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Numbers</option>
              {whatsappNumbers.map((num) => (
                <option key={num.id} value={num.id}>
                  {num.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="document">Document</option>
              <option value="audio">Audio</option>
            </select>
          </div>
        </div>
      </div>

      {/* Media List */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Your Media ({filteredMedia.length})</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading media...</p>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No media files found. Upload your first media file above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Media ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WhatsApp Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMedia.map((media) => (
                  <tr key={media.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{media.file_name}</div>
                      {media.description && (
                        <div className="text-sm text-gray-500">{media.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        media.file_type === 'video' ? 'bg-purple-100 text-purple-800' :
                        media.file_type === 'image' ? 'bg-green-100 text-green-800' :
                        media.file_type === 'audio' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {media.file_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(media.file_size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {media.media_id}
                        </code>
                        <button
                          onClick={() => copyMediaId(media.media_id)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Copy Media ID"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {media.whatsapp_numbers?.display_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(media.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleDelete(media.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">💡 How to Use Media IDs</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>In your CSV file:</strong></p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Copy the Media ID from the table above (click 📋 icon)</li>
            <li>Paste it in your CSV's media column instead of a URL</li>
            <li>Example: <code className="bg-white px-2 py-1 rounded">123456789012345</code> instead of <code className="bg-white px-2 py-1 rounded">https://...</code></li>
          </ul>
          <p className="mt-3"><strong>Benefits:</strong></p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>✅ Faster delivery (WhatsApp doesn't fetch from URL)</li>
            <li>✅ More reliable (no URL timeouts)</li>
            <li>✅ Reusable across unlimited campaigns</li>
            <li>✅ Auto-detected by the system (URLs still work too!)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MediaLibrary;
