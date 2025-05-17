import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Download, Image as ImageIcon, Loader2, Mail, X, Trash2, BookOpen, CheckCircle2, TrendingUp } from 'lucide-react';
import './UI.css';
import xIcon from './x_icon.png';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const AffiliateAdArea = ({ label, index }: { label: string; index: number }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay: index * 0.2 }}
    className="w-full h-48 text-gray-800 flex items-center justify-center rounded-lg shadow-lg mb-6 border border-yellow-300 bg-yellow-50 hover:shadow-xl transition-all duration-300 cursor-pointer"
  >
    <div className="text-center p-4">
      <div className="text-yellow-600 font-bold mb-2">{label}</div>
    </div>
  </motion.div>
);

const GoogleAdsenseAdArea = AffiliateAdArea;

const Footer = () => (
  <motion.footer
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.3 }}
    className="w-full text-gray-800 py-6 flex items-center justify-center mt-12 bg-blue-100 sticky bottom-0 z-50"
  >
    <a
      href="https://x.com/TENM3169"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 hover:scale-105 transition-transform duration-300"
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden">
        <img src={xIcon} alt="X icon" className="w-full h-full object-contain" />
      </div>
      <span className="text-blue-600 hover:underline font-medium">エラーや相談などで御用の方は、@TENM3169(Xアカウント)のDMまでご連絡ください(この文章を押してください。)</span>
    </a>
  </motion.footer>
);

interface ImageDetail {
  id: string;
  name: string;
  originalSrc: string;
  file: File; // To store the actual File object
  compressedSrc: string | null;
  originalSize?: number;
  compressedSize?: number;
}

// ★ 統計データ用のインターフェース
interface DailyStat {
  date: string; // バックエンドのレスポンスキー 'date' に合わせる
  count: number; // バックエンドのレスポンスキー 'count' に合わせる
}

const ImageCompressorApp = () => {
  const [selectedImages, setSelectedImages] = useState<ImageDetail[]>([]);
  const [compressedZipBlob, setCompressedZipBlob] = useState<Blob | null>(null);
  const [compressedZipFilename, setCompressedZipFilename] = useState<string>('圧縮保存した写真フォルダ.zip');
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStatusMessage, setCompressionStatusMessage] = useState<string | null>(null);
  const [emailSendStatusMessage, setEmailSendStatusMessage] = useState<string | null>(null);
  const [currentCompressionTaskId, setCurrentCompressionTaskId] = useState<string | null>(null);
  const [currentEmailTaskId, setCurrentEmailTaskId] = useState<string | null>(null);
  const [emailSentMessage, setEmailSentMessage] = useState<string | null>(null);
  const [isUsageDialogOpen, setIsUsageDialogOpen] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]); // ★ 日毎の統計データ用state
  const [statsError, setStatsError] = useState<string | null>(null); // ★ 統計データ取得エラー用state

  // ★ ページ読み込み時にアクセスを記録し、統計データを取得するuseEffect
  useEffect(() => {
    // アクセス記録APIを呼び出し
    const recordAccess = async () => {
      try {
        const response = await fetch('https://ic2-backend-44qq.onrender.com/record-access', { method: 'POST' });
        if (!response.ok) {
          console.error('Failed to record access:', response.statusText);
        } else {
          console.log('Access recorded successfully.');
        }
      } catch (error) {
        console.error('Error recording access:', error);
      }
    };

    // 日毎の統計データを取得
    const fetchDailyStats = async () => {
      console.log('[fetchDailyStats] Fetching daily stats...');
      try {
        const response = await fetch('https://ic2-backend-44qq.onrender.com/daily-stats');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "統計データの取得に失敗しました。" }));
          console.error('[fetchDailyStats] Failed to fetch, status:', response.status, 'Error data:', errorData);
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data: DailyStat[] = await response.json();
        console.log('[fetchDailyStats] Received data:', data);
        // バックエンドから正しいキー名 (date, count) でデータが来ているか確認
        if (data && data.length > 0 && 'date' in data[0] && 'count' in data[0]) {
            setDailyStats(data);
            setStatsError(null);
        } else if (data && data.length > 0) {
            // キー名が違う場合のフォールバックやログ
            console.warn('[fetchDailyStats] Data received with unexpected keys. Expected "date" and "count". Received:', data[0]);
            // もし visit_date, visit_count で来ていたら変換する (一時的な対応)
            const mappedData = data.map((item: any) => ({
                date: item.visit_date || item.date,
                count: item.visit_count || item.count
            })).filter(item => item.date && typeof item.count === 'number');
            
            if(mappedData.length > 0 && 'date' in mappedData[0] && 'count' in mappedData[0]) {
                console.log('[fetchDailyStats] Mapped data to use:', mappedData);
                setDailyStats(mappedData);
                setStatsError(null);
            } else {
                setStatsError('統計データの形式が正しくありません。');
                setDailyStats([]);
            }
        } else {
            setDailyStats([]); // データがない場合は空配列
            setStatsError(null); // エラーではない
        }
      } catch (error: any) {
        console.error('[fetchDailyStats] Error fetching daily stats:', error);
        setStatsError(error.message || '統計データの読み込み中にエラーが発生しました。');
        setDailyStats([]); // エラー時はデータを空にする
      }
    };

    recordAccess();
    fetchDailyStats();
  }, []); // 空の依存配列で初回マウント時のみ実行

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const filePromises = Array.from(files).map((file, index) => {
        return new Promise<ImageDetail>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              id: `${file.name}-${Date.now()}-${index}`,
              name: file.name,
              originalSrc: event.target?.result as string,
              file: file, 
              compressedSrc: null,
              originalSize: file.size,
              compressedSize: undefined,
            });
          };
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
        });
      });

      Promise.all(filePromises)
        .then(newImageDetails => {
          setSelectedImages(prevImages => [...prevImages, ...newImageDetails]);
          setCompressedZipBlob(null);
          setEmail('');
          setCompressionStatusMessage(null);
          setEmailSendStatusMessage(null);
          setEmailSentMessage(null);
          setCurrentCompressionTaskId(null);
          setCompressedZipFilename('圧縮保存した写真フォルダ.zip'); 
          setCurrentEmailTaskId(null);
        })
        .catch(error => {
          console.error("ファイル読み込みエラー:", error);
          alert("ファイルの読み込み中にエラーが発生しました。");
        });
    }
  }, []);

  const handleRemoveImage = useCallback((imageIdToRemove: string) => {
    setSelectedImages(prevImages =>
      prevImages.filter(image => image.id !== imageIdToRemove)
    );
  }, []);

  const handleResetAll = useCallback(() => {
    setSelectedImages([]);
    setCompressedZipBlob(null);
    setEmail('');
    setCompressionStatusMessage(null);
    setEmailSendStatusMessage(null);
    setEmailSentMessage(null);
    setCurrentCompressionTaskId(null);
    setCurrentEmailTaskId(null);
    setCompressedZipFilename('圧縮保存した写真フォルダ.zip'); 
    setIsCompressing(false); 
    setIsSendingEmail(false); 
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);
  
  const downloadCompressedZip = useCallback(() => {
    console.log("downloadCompressedZip function CALLED!");
    if (!compressedZipBlob) {
      alert("ダウンロードするZIPファイルがありません。");
      return;
    }
    if (!compressedZipFilename) {
      alert("ダウンロードするファイル名が設定されていません。");
      return;
    }
    const url = window.URL.createObjectURL(compressedZipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = compressedZipFilename; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    console.log("ZIP file download initiated by downloadCompressedZip function.");
  }, [compressedZipBlob, compressedZipFilename]);

  const pollTaskStatus = useCallback((
    taskId: string,
    onComplete: (data: any, filename?: string) => void, 
    onError: (errorMsg: string) => void,
    setStatusMessage: (msg: string | null) => void,
    isCompressionTask: boolean = false
  ) => {
    const interval = 3000;
    const maxAttempts = 60;
    let attempts = 0;
    let currentTimeoutId: NodeJS.Timeout | null = null;
    const taskType = isCompressionTask ? 'Compress' : 'Email';

    const clearPolling = () => {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
        console.log(`[pollTaskStatus (${taskType})] Polling cleared for task: ${taskId}`);
      }
    };

    if (isCompressionTask && currentEmailTaskId) {
        console.log(`[pollTaskStatus (${taskType})] Previous email task polling might be active. Consider more robust polling management.`);
    } else if (!isCompressionTask && currentCompressionTaskId) {
        console.log(`[pollTaskStatus (${taskType})] Previous compression task polling might be active. Consider more robust polling management.`);
    }

    const checkStatus = async () => {
      if ((isCompressionTask && !currentCompressionTaskId) || (!isCompressionTask && !currentEmailTaskId)) {
        console.log(`[pollTaskStatus (${taskType})] Task ID cleared, stopping polling for ${taskId}.`);
        clearPolling();
        return;
      }
      if (taskId !== (isCompressionTask ? currentCompressionTaskId : currentEmailTaskId)) {
        console.log(`[pollTaskStatus (${taskType})] Polling for task ${taskId} is stale (current is ${isCompressionTask ? currentCompressionTaskId : currentEmailTaskId}), stopping.`);
        clearPolling();
        return;
      }

      if (attempts >= maxAttempts) {
        setStatusMessage("処理がタイムアウトしました。しばらくしてからもう一度お試しください。");
        onError("タイムアウト");
        console.error(`[pollTaskStatus (${taskType})] Task ${taskId} timed out after ${maxAttempts} attempts.`);
        clearPolling();
        if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
        return;
      }
      attempts++;

      try {
        console.log(`[pollTaskStatus (${taskType}) attempt ${attempts}] Fetching status for task: ${taskId}`);
        const response = await fetch(`http://localhost:5001/task-status/${taskId}`);
        
        if (response.status === 200) {
          const contentType = response.headers.get("content-type");
          console.log(`[pollTaskStatus (${taskType})] Task ${taskId} - Response Content-Type:`, contentType);
          if (contentType?.includes("application/zip")) { 
            setStatusMessage(null);
            console.log(`[pollTaskStatus (${taskType})] Task ${taskId} - Preparing to call onComplete with blob.`);
            const blob = await response.blob();
            let filenameFromServer = '圧縮保存した写真フォルダ.zip'; 
            const disposition = response.headers.get('content-disposition');
            console.log(`[pollTaskStatus (${taskType})] Raw Content-Disposition header for task ${taskId}:`, disposition);

            if (disposition) {
              const filenameStarMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
              if (filenameStarMatch && filenameStarMatch[1]) {
                try {
                  filenameFromServer = decodeURIComponent(filenameStarMatch[1]);
                  console.log(`[pollTaskStatus (${taskType})] Extracted filename from filename* (UTF-8) for task ${taskId}:`, filenameFromServer);
                } catch (e) {
                  console.warn(`[pollTaskStatus (${taskType})] decodeURIComponent failed for filename* '${filenameStarMatch[1]}' for task ${taskId}:`, e);
                  const filenameMatch = disposition.match(/filename="([^"]+)"/i) || disposition.match(/filename=([^;]+)/i);
                  if (filenameMatch && filenameMatch[1]) {
                    filenameFromServer = filenameMatch[1].replace(/^"|"$/g, ''); 
                    console.log(`[pollTaskStatus (${taskType})] Extracted filename from plain filename (fallback after filename* error) for task ${taskId}:`, filenameFromServer);
                  }
                }
              } else {
                const filenameMatch = disposition.match(/filename="([^"]+)"/i) || disposition.match(/filename=([^;]+)/i);
                if (filenameMatch && filenameMatch[1]) {
                  filenameFromServer = filenameMatch[1].replace(/^"|"$/g, ''); 
                  console.log(`[pollTaskStatus (${taskType})] Extracted filename from plain filename for task ${taskId}:`, filenameFromServer);
                }
              }
            } else {
              console.log(`[pollTaskStatus (${taskType})] Content-Disposition header not found or not an attachment for task ${taskId}. Using default.`);
            }

            console.log(`[pollTaskStatus (${taskType})] Final filename to be passed to onComplete for task ${taskId}: ${filenameFromServer}`);
            onComplete(blob, filenameFromServer); 
            console.log(`[pollTaskStatus (${taskType})] Task ${taskId} completed (ZIP received).`);
            clearPolling();
            if (isCompressionTask) setIsCompressing(false);
          } else if (contentType?.includes("application/json")) {
            const data = await response.json();
            console.log(`[pollTaskStatus (${taskType})] Task ${taskId} JSON response:`, data);
            if (data.status === "processing" || data.status === "pending") {
              setStatusMessage(`処理中です... (${attempts}ステップ/${maxAttempts}ステップ)`);
              currentTimeoutId = setTimeout(checkStatus, interval);
            } else if (data.status === "completed") {
              setStatusMessage(null);
              onComplete(data.result || data); 
              console.log(`[pollTaskStatus (${taskType})] Task ${taskId} completed (JSON result). Result:`, data.result || data);
              clearPolling();
              if (!isCompressionTask) setIsSendingEmail(false);
            } else if (data.status === "error") {
              setStatusMessage(`エラー: ${data.error || '不明なエラー'}`);
              onError(data.error || '不明なエラー');
              console.error(`[pollTaskStatus (${taskType})] Task ${taskId} error (JSON):`, data.error || '不明なエラー');
              clearPolling();
              if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
            } else {
                setStatusMessage("予期しないレスポンス形式です (JSON status unknown)。");
                onError("予期しないレスポンス形式 (JSON status unknown)");
                console.error(`[pollTaskStatus (${taskType})] Task ${taskId} unexpected JSON status:`, data);
                clearPolling();
                if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
            }
          } else {
            setStatusMessage("サーバーから予期しない形式の応答がありました。");
            onError("予期しない応答形式");
            console.error(`[pollTaskStatus (${taskType})] Task ${taskId} unexpected Content-Type: ${contentType}`);
            clearPolling();
            if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
          }
        } else { 
          const errorText = await response.text();
          setStatusMessage(`エラーが発生しました: ${response.status} ${errorText}`);
          onError(`サーバーエラー: ${response.status} ${errorText}`);
          console.error(`[pollTaskStatus (${taskType})] Task ${taskId} server error ${response.status}:`, errorText);
          clearPolling();
          if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
        }
      } catch (error) {
        setStatusMessage("ステータス確認中にネットワークエラーが発生しました。");
        onError("ネットワークエラー");
        console.error(`[pollTaskStatus (${taskType})] Task ${taskId} network error:`, error);
        clearPolling();
        if (isCompressionTask) setIsCompressing(false); else setIsSendingEmail(false);
      }
    };
    console.log(`[pollTaskStatus (${taskType})] Starting polling for task: ${taskId}`);
    checkStatus();
    return clearPolling; 
  }, [currentCompressionTaskId, currentEmailTaskId]);

  const handleCompress = useCallback(async () => {
    if (selectedImages.length === 0 || isCompressing) {
      if (selectedImages.length === 0) alert("圧縮する画像が選択されていません。");
      return;
    }

    setIsCompressing(true);
    setCompressedZipBlob(null);
    setEmail('');
    setCompressionStatusMessage("圧縮処理の準備をしています...");
    setEmailSendStatusMessage(null);
    setEmailSentMessage(null);
    setCompressedZipFilename('圧縮保存した写真フォルダ.zip'); 
    setCurrentEmailTaskId(null); 

    const formData = new FormData();
    selectedImages.forEach(imageDetail => { 
      formData.append('images', imageDetail.file, imageDetail.name);
    });

    if (formData.getAll('images').length === 0) {
      alert("APIに送信する画像がありません。");
      setIsCompressing(false);
      setCompressionStatusMessage(null);
      return;
    }

    try {
      console.log("[handleCompress] Sending request to /compress-images");
      const response = await fetch('https://ic2-backend-44qq.onrender.com/compress-images', {
        method: 'POST',
        body: formData,
      });

      if (response.ok && response.status === 202) {
        const data = await response.json();
        console.log("[handleCompress] Received task_id:", data.task_id);
        setCompressionStatusMessage("圧縮処理を受け付けました。完了までお待ちください...");
        setCurrentCompressionTaskId(data.task_id); 
      } else {
        const errorData = await response.json().catch(() => ({ error: "サーバーからのエラー詳細取得に失敗しました。" }));
        console.error("[handleCompress] Image compression error:", response.status, errorData);
        alert(`画像圧縮エラー: ${errorData.error || response.statusText}`);
        setIsCompressing(false);
        setCompressionStatusMessage(null);
        setCurrentCompressionTaskId(null); 
      }
    } catch (error) {
      console.error("[handleCompress] Unexpected error during image compression:", error);
      alert(`画像圧縮中に予期せぬエラーが発生しました。`);
      setIsCompressing(false);
      setCompressionStatusMessage(null);
      setCurrentCompressionTaskId(null); 
    }
  }, [selectedImages, isCompressing]); // pollTaskStatus を依存配列から削除 (直接呼び出していないため)

  const handleSendEmail = useCallback(async () => {
    if (!compressedZipBlob) {
      alert("送信するZIPファイルがありません。");
      return;
    }
    if (!email) {
      alert("送信先のメールアドレスを入力してください。");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("有効なメールアドレスを入力してください。");
      return;
    }

    setEmailSentMessage(null);
    setEmailSendStatusMessage("メール送信処理の準備をしています...");
    setIsSendingEmail(true);
    setCurrentCompressionTaskId(null); 

    const formData = new FormData();
    formData.append('zip_file', compressedZipBlob, compressedZipFilename); 
    formData.append('email_address', email);

    try {
      console.log("[handleSendEmail] Sending request to /send-zip-email");
      const response = await fetch('http://localhost:5001/send-zip-email', {
        method: 'POST',
        body: formData,
      });

      if (response.ok && response.status === 202) {
        const data = await response.json();
        console.log("[handleSendEmail] Received task_id:", data.task_id);
        setEmailSendStatusMessage("メール送信処理を受け付けました。完了までお待ちください...");
        setCurrentEmailTaskId(data.task_id); 
      } else {
        const errorData = await response.json().catch(() => ({ error: "サーバーからのエラー詳細取得に失敗しました。" }));
        console.error("[handleSendEmail] Email sending error:", response.status, errorData);
        alert(`メール送信エラー: ${errorData.error || response.statusText}`);
        setIsSendingEmail(false);
        setEmailSendStatusMessage(null);
        setCurrentEmailTaskId(null); 
      }
    } catch (error) {
      console.error("[handleSendEmail] Unexpected error during email sending:", error);
      alert(`メール送信中に予期せぬエラーが発生しました。`);
      setIsSendingEmail(false);
      setEmailSendStatusMessage(null);
      setCurrentEmailTaskId(null); 
    }
  }, [compressedZipBlob, email, compressedZipFilename]); // pollTaskStatus を依存配列から削除

  useEffect(() => {
    let clearPollingFunction: (() => void) | null = null;

    if (currentCompressionTaskId && isCompressing) {
      console.log(`[useEffect Compress] Detected currentCompressionTaskId: ${currentCompressionTaskId}, starting poll.`);
      clearPollingFunction = pollTaskStatus(
        currentCompressionTaskId,
        (blobResult: any, filename?: string) => { 
          console.log("[useEffect Compress onComplete] Received blobResult:", blobResult, "Filename from onComplete callback:", filename); 
          if (blobResult instanceof Blob) {
            setCompressedZipBlob(blobResult);
            const finalFilenameToSet = filename || '圧縮保存した写真フォルダ.zip';
            setCompressedZipFilename(finalFilenameToSet); 
            console.log("[useEffect Compress onComplete] Called setCompressedZipFilename with:", finalFilenameToSet); 
          } else {
            console.error("[useEffect Compress onComplete] Expected Blob, got:", typeof blobResult);
          }
          setCompressionStatusMessage("圧縮が完了しました！");
        },
        (errorMsg: string) => {
          console.error("[useEffect Compress pollTaskStatus onError] 画像圧縮ポーリングエラー:", errorMsg);
          setCompressionStatusMessage(`圧縮エラー: ${errorMsg}`);
        },
        setCompressionStatusMessage,
        true 
      );
    }

    return () => {
      if (clearPollingFunction) {
        console.log(`[useEffect Compress Cleanup] Clearing polling for compression task: ${currentCompressionTaskId}.`);
        clearPollingFunction();
      }
    };
  }, [currentCompressionTaskId, isCompressing, pollTaskStatus]);

  useEffect(() => {
    let clearPollingFunction: (() => void) | null = null;

    if (currentEmailTaskId && isSendingEmail) {
      console.log(`[useEffect Email] Detected currentEmailTaskId: ${currentEmailTaskId}, starting poll.`);
      clearPollingFunction = pollTaskStatus(
        currentEmailTaskId,
        (result: { message: string }) => {
          console.log("[useEffect Email onComplete] Received result:", result);
          setEmailSentMessage(result.message || "メール送信が完了しました。");
          setEmailSendStatusMessage(null);
        },
        (errorMsg: string) => {
          console.error("[useEffect Email pollTaskStatus onError] メール送信ポーリングエラー:", errorMsg);
          setEmailSendStatusMessage(`メール送信エラー: ${errorMsg}`);
        },
        setEmailSendStatusMessage,
        false 
      );
    }

    return () => {
      if (clearPollingFunction) {
        console.log(`[useEffect Email Cleanup] Clearing polling for email task: ${currentEmailTaskId}.`);
        clearPollingFunction();
      }
    };
  }, [currentEmailTaskId, isSendingEmail, pollTaskStatus]);

  // ★ グラフデータとオプションの準備
  const chartData = {
    labels: dailyStats.map(stat => {
      // 日付のフォーマットを MM/DD に変更 (例: "2023-05-17" -> "5/17")
      const parts = stat.date.split('-');
      // parts[1]は月(1-12)、parts[2]は日(1-31)と想定
      return parts.length === 3 ? `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}` : stat.date;
    }),
    datasets: [
      {
        label: '日毎の利用者数',
        data: dailyStats.map(stat => stat.count),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
        barThickness: 30, // ★ 棒の太さを30pxに指定 (値を調整してください)
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // ★ コンテナに合わせてサイズ調整
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '過去30日間の利用者数推移',
        font: {
          size: 16
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1, // 整数で目盛りを表示
        }
      },
    },
  };


  const formatFileSize = (bytes: number | undefined) => {
    if (bytes === undefined) return "不明";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const imageGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '8px',
    marginTop: '16px',
  };

  const imagePreviewContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 'auto',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s ease',
    position: 'relative',
  };

  const imagePreviewStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '120px',
    objectFit: 'contain',
    borderRadius: '4px',
  };

  const coolButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #4CAF50, #388E3C)',
    border: 'none',
    color: 'white',
    padding: '10px 20px',
    textAlign: 'center',
    textDecoration: 'none',
    display: 'inline-block',
    fontSize: '16px',
    margin: '4px 8px',
    cursor: 'pointer',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
    width: '200px',
  };

  const coolButtonDisabledStyle: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #B0BEC5, #90A4AE)',
    color: '#616161',
    cursor: 'not-allowed',
    boxShadow: 'none',
    transform: 'none',
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 px-6 shadow-lg sticky top-0 z-50" 
      >
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide flex items-center"> 
            <ImageIcon className="mr-2" />
            Image Compression Machine
          </h1>
          <Dialog open={isUsageDialogOpen} onOpenChange={setIsUsageDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-black border-white hover:bg-white hover:text-purple-600 !h-7 !py-1">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                使い方
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-white text-gray-800">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-indigo-700">使い方ガイド</DialogTitle>
                <DialogDescription className="text-sm text-gray-600 mt-1">Image Compression Machine のご利用方法をご案内します。</DialogDescription>
              </DialogHeader>
              <div className="prose prose-sm max-w-none py-4 text-gray-700 overflow-y-auto max-h-[60vh]">
                <h2 className="text-lg font-semibold text-indigo-600 mt-0">ようこそ！Image Compression Machine へ。</h2>
                <p>このツールで簡単に画像を圧縮できます。</p>

                <h3 className="text-md font-semibold text-indigo-600 mt-3">1. 画像を選択</h3>
                <p>「1.画像を選択してください」エリアにあるファイル選択ボタン（点線の枠内）をクリックするか、画像をドラッグ＆ドロップ（対応ブラウザのみ）して、圧縮したい画像を選びます。<br />JPEG, PNG, GIF, WEBP 形式の画像に対応しており、複数選択も可能です。<br />選択した画像は「2.入力画像一覧」にプレビューとして表示されます。</p>
                
                <h3 className="text-md font-semibold text-indigo-600 mt-3">2. 選択画像の確認と個別キャンセル (任意)</h3>
                <p>「2.入力画像一覧」で、選択した画像を確認できます。<br />もし間違えて画像を選択してしまった場合は、各画像プレビューの右上に表示される「✖」ボタンをクリックすると、その画像をリストから削除できます。</p>

                <h3 className="text-md font-semibold text-indigo-600 mt-3">3. 圧縮処理の開始</h3>
                <p>圧縮したい画像がすべてリストに表示されたら、「圧縮処理スタート」ボタンをクリックしてください。<br />選択された画像の圧縮処理がバックグラウンドで実行されます。処理中はボタンの表示が「圧縮処理中...」に変わります。</p>

                <h3 className="text-md font-semibold text-indigo-600 mt-3">4. 圧縮結果の取得</h3>
                <p>圧縮が完了すると、「3.圧縮済み画像フォルダ」エリアに「圧縮が完了しました！」というメッセージと共に、以下の操作が可能になります。</p>
                <ul className="list-disc list-inside pl-4">
                  <li><strong>ZIPファイルをダウンロード</strong>: クリックすると、圧縮されたすべての画像がひとつのZIPファイルにまとめられてダウンロードされます。</li>
                  <li><strong>メールで送信</strong>: メールアドレスを入力し、「メールで送信」ボタンをクリックすると、圧縮済みZIPファイルが指定のメールアドレスに送信されます。</li>
                </ul>

                <h3 className="text-md font-semibold text-indigo-600 mt-3">5. リセット (任意)</h3>
                <p><strong>「すべてリセット」ボタン</strong>: 「圧縮処理スタート」ボタンの下、または「ZIPファイルをダウンロード」ボタンの下にあります。<br />このボタンをクリックすると、現在選択されているすべての画像、および表示されている圧縮結果がクリアされ、アプリケーションが初期状態に戻ります。</p>

                <h3 className="text-md font-semibold text-indigo-600 mt-3">その他</h3>
                <p>エラーやご不明な点、ご要望がございましたら、フッターに記載のXアカウントまでお気軽にご連絡ください。</p>
              </div>
              <DialogFooter className="sm:justify-start">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="border-indigo-500 text-indigo-600 hover:bg-indigo-50">
                    閉じる
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </motion.header>

      <main className="flex flex-col items-center w-full py-8 px-4 md:px-8">
        <div className="flex w-full" id="main-content-layout-wrapper">
          <div className="flex flex-col mr-8" id="affiliate-ads-section">
            {/* <AffiliateAdArea label="アフィリエイト1" index={0} /> */}
            {/* <GoogleAdsenseAdArea label="GoogleAdSense 1" index={0} /> */}
          </div>

          <div className='flex flex-col items-center flex-grow' id="image-compressor-section">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-xl bg-white rounded-xl shadow-xl p-6 mb-8"
            >
              <div className="mb-6">
                <label
                  htmlFor="file-upload"
                  className="block mb-2 text-lg font-medium text-indigo-600"
                >
                  1.画像を選択してください
                </label>
                <div className="relative">
                  <Input
                    id="file-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    ref={inputRef}
                    className="w-full h-16 cursor-pointer border-2 border-dashed border-blue-300 rounded-lg p-4 !placeholder:text-black
                              focus:outline-none focus:border-blue-500 transition-colors duration-300"
                  />
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-2 flex items-center text-indigo-600">
                  2.入力画像一覧 ({selectedImages.length})
                </h3>
                {selectedImages.length > 0 ? (
                  <div style={imageGridStyle} className="mb-4 w-full">
                    {selectedImages.map((image, idx) => (
                      <motion.div
                        key={image.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: idx * 0.1 }}
                        style={imagePreviewContainerStyle}
                        className="group"
                      >
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-1.5 right-1.5 h-6 w-6 p-0 rounded-full z-10 opacity-80 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(image.id);
                            }}
                            aria-label={`Remove ${image.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <img
                            src={image.originalSrc}
                            alt={`入力画像: ${image.name}`}
                            style={imagePreviewStyle}
                          />
                        <p className="text-xs truncate text-gray-700 mt-1 w-full text-center" title={image.name}>{image.name}</p>
                        <p className="text-xs text-gray-500 w-full text-center">{formatFileSize(image.originalSize)}</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-gray-200">
                    <div className="text-center flex flex-col items-center">
                      <ImageIcon className="mx-auto mb-2" />
                      <p>画像を選択してください</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6 flex flex-col items-center">
                <button
                  onClick={handleCompress}
                  disabled={selectedImages.length === 0 || isCompressing}
                  style={isCompressing || selectedImages.length === 0 ? { ...coolButtonStyle, ...coolButtonDisabledStyle } : coolButtonStyle}
                >
                  {isCompressing ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                      圧縮処理中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center" >
                      「圧縮処理スタート」ボタン
                    </span>
                  )}
                </button>
                {selectedImages.length > 0 && !isCompressing && (
                  <Button
                    variant="destructive"
                    onClick={handleResetAll}
                    className="mt-2"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    すべてリセット
                  </Button>
                )}
                {compressionStatusMessage && !compressedZipBlob && isCompressing && (
                  <div className="mt-3 p-2 text-sm text-blue-700 bg-blue-100 border border-blue-200 rounded-md w-full text-center">
                    {compressionStatusMessage}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-700 mb-2 flex items-center text-indigo-600">
                  3.圧縮済み画像フォルダ
                </h3>
                {isCompressing && !compressionStatusMessage?.includes("完了") && !compressionStatusMessage?.includes("エラー") ? (
                   <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-gray-200">
                     <div className="text-center flex flex-col items-center">
                       <Loader2 className="animate-spin mx-auto mb-2 h-8 w-8" />
                       <p>{compressionStatusMessage || "圧縮処理中..."}</p>
                     </div>
                   </div>
                ) : compressedZipBlob || compressionStatusMessage === "圧縮が完了しました！" ? (
                  <div className="w-full h-auto bg-green-100 rounded-lg flex flex-col items-center justify-center text-green-800 border border-green-200 p-4 space-y-3">
                    <p className="font-semibold text-lg">
                      {compressionStatusMessage === "圧縮が完了しました！" ? compressionStatusMessage : (compressedZipBlob ? "圧縮が完了しました！" : "")}
                    </p>

                    <Button onClick={downloadCompressedZip} className="bg-green-600 hover:bg-green-700 text-white">
                       <Download className="mr-2 h-4 w-4" /> ZIPファイルをダウンロード
                    </Button>
                    {!isSendingEmail && (
                        <Button
                        variant="destructive"
                        onClick={handleResetAll}
                        className="mt-2"
                        >
                        <Trash2 className="mr-2 h-4 w-4" />
                        すべてリセット
                        </Button>
                    )}
                    <div className="w-full max-w-sm mt-4 pt-4 border-t border-green-300">
                      <label htmlFor="email-input" className="block text-sm font-medium text-green-700 mb-1">または、メールで送信:</label>
                      <Input
                        id="email-input"
                        type="email"
                        placeholder="例: your_email@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border-green-300 focus:border-green-500 focus:ring-green-500"
                        disabled={isSendingEmail}
                      />
                      <Button onClick={handleSendEmail} disabled={isSendingEmail || !email || !compressedZipBlob} className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white">
                        {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        {isSendingEmail ? '送信中...' : 'メールで送信'}
                      </Button>
                      {emailSendStatusMessage && isSendingEmail && (
                        <div className="mt-3 p-2 text-sm text-blue-700 bg-blue-100 border border-blue-200 rounded-md w-full text-center">
                          {emailSendStatusMessage}
                        </div>
                      )}
                      {emailSentMessage && (
                        <div className="mt-3 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-center font-sans">
                          <CheckCircle2 className="h-5 w-5 mr-2 text-yellow-600 flex-shrink-0" />
                          <span>{emailSentMessage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : compressionStatusMessage && compressionStatusMessage.includes("エラー") ? (
                    <div className="w-full h-auto bg-red-100 rounded-lg flex flex-col items-center justify-center text-red-800 border border-red-200 p-4 space-y-3">
                        <p className="font-semibold text-lg">エラーが発生しました</p>
                        <p className="text-sm">{compressionStatusMessage}</p>
                        <Button
                            variant="destructive"
                            onClick={handleResetAll}
                            className="mt-2"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            リセットしてやり直す
                        </Button>
                    </div>
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-gray-200">
                    <div className="text-center flex flex-col items-center">
                      <Download className="mx-auto mb-2" />
                      <p>{selectedImages.length > 0 ? '「圧縮処理スタート」ボタンを押してください' : '圧縮処理した画像が表示されます'}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          <div className="flex flex-col mr-8" id="affiliate-ads-section">
            {/* <AffiliateAdArea label="アフィリエイト2" index={1} /> */}
            {/* <GoogleAdsenseAdArea label="GoogleAdSense 2" index={1} /> */}
          </div>
        </div>

        {/* ★ 利用者数グラフのセクションを追加 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-3xl bg-white rounded-xl shadow-xl p-6 mt-12" // 少し上にマージンを追加
        >
          <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center text-indigo-600">
            <TrendingUp className="mr-2 h-6 w-6" />
            利用者数の推移 (過去30日間)
          </h3>
          {statsError ? (
            <div className="text-red-500 text-center py-4">{statsError}</div>
          ) : dailyStats.length > 0 ? (
            <div style={{ height: '300px', width: '100%' }}> {/* グラフのサイズを指定 */}
              <Bar data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">統計データがありません。</div>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default ImageCompressorApp;
