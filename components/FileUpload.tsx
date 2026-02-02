
import React, { useRef, useState } from 'react';

interface FileUploadProps {
  onUpload: (base64: string, mimeType: string, fileInfo?: { name: string, size: number }) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      onUpload(base64, file.type, { name: file.name, size: file.size });
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Feed Your MoneyMind</h2>
        <p className="text-slate-500">Upload payslips, bank statements, or Excel exports. Our AI will extract the data for you.</p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
          dragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-emerald-400'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <i className="fas fa-cloud-upload-alt text-3xl text-slate-400"></i>
        </div>
        <p className="text-lg font-medium text-slate-700">Drag & drop documents here</p>
        <p className="text-slate-400 mt-1">or click to browse from your device</p>
        <p className="text-xs text-slate-400 mt-4 uppercase tracking-widest font-bold">Supports PNG, JPG, PDF, Excel</p>
        
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.xlsx,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <UploadBenefit icon="fa-lock" title="Secure" desc="Your data is private" />
        <UploadBenefit icon="fa-bolt" title="Fast" desc="Instant AI analysis" />
        <UploadBenefit icon="fa-brain" title="Smart" desc="Automatic categorization" />
      </div>
    </div>
  );
};

const UploadBenefit: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
    <i className={`fas ${icon} text-emerald-500 mb-2`}></i>
    <h4 className="font-semibold text-slate-800 text-sm">{title}</h4>
    <p className="text-xs text-slate-500">{desc}</p>
  </div>
);

export default FileUpload;
