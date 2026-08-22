import React, { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { clsButton, clsInput } from './tailwindComponents';


export const ConnectScreen: React.FC<{ onConnect: (c: string, n: string, host?: string) => Promise<boolean> }> = ({ onConnect }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // We add state to keep track of the dynamic host
  const [targetHost, setTargetHost] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // 1. HANDLE DEEP LINKING 
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
      setCode(urlCode);
      setTargetHost(window.location.origin); // Save the host
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const submit = async () => {
    if (!code || !name) return;
    setLoading(true);
    
    // Pass the targetHost (if we have one) into the connect function
    const success = await onConnect(code, name, targetHost);
    
    setError(!success);
    setLoading(false);
  };
          
  
    // --- CAMERA SCANNING UI ---
    if (isScanning) {
      return (
        <div className="flex flex-col h-full w-full animate-fade-in">
          <div className="flex-grow"></div>
          <h2 className="text-center mb-5">Scan Game QR</h2>
          
          <div className="rounded-2xl overflow-hidden border-2 border-[#50e3c2] mb-5 w-full aspect-square relative bg-black">
          <Scanner 
            onScan={(result) => {
              if (result && result.length > 0) {
                const rawData = result[0].rawValue;
                try {
                  const scannedUrl = new URL(rawData);
                  const extractedCode = scannedUrl.searchParams.get('code');
                  
                  if (extractedCode) {
                    setCode(extractedCode);
                    // Extract the origin (e.g., "http://192.168.1.15:8080")
                    setTargetHost(scannedUrl.origin); 
                    setIsScanning(false);
                  }
                } catch (e) {
                  setCode(rawData);
                  setIsScanning(false);
                }
              }
            }} 
            />
          </div>
          
          <div className="flex-grow"></div>
          <button 
            className={`${clsButton} border-[#ff5252] text-[#ff5252]`} 
            onClick={() => setIsScanning(false)}
          >
            Cancel
          </button>
        </div>
      );
    }
  
    // --- STANDARD INPUT UI ---
    return (
      <div className="flex flex-col h-full w-full animate-fade-in">
        <div className="flex-grow"></div>
        <div className={`text-[#ff5252] text-center mb-5 min-h-[40px] ${error ? 'visible' : 'invisible'}`}>
          Game Not Found<br/>Start one on Desktop
        </div>
        
        <button 
          className={`${clsButton} border-[#50e3c2] text-[#50e3c2] mb-5`} 
          onClick={() => setIsScanning(true)}
        >
          📷 Scan QR Code
        </button>
        
        <div className="text-center text-sm text-[#888] mb-5">- OR -</div>
  
        <input 
          className={clsInput}
          type="text" placeholder="Game Code" 
          value={code} onChange={e => setCode(e.target.value)} 
        />
        <input 
          className={clsInput}
          type="text" placeholder="Player Name" 
          value={name} onChange={e => setName(e.target.value)} 
        />
        <div className="flex-grow"></div>
        <button className={clsButton} onClick={submit} disabled={loading}>
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    );
  };