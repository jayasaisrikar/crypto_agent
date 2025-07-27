export async function checkQdrantHealth(): Promise<{
  available: boolean;
  message: string;
  suggestions?: string[];
}> {
  try {
    const response = await fetch('http://127.0.0.1:6333/collections', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      return {
        available: true,
        message: '✅ Qdrant is running and accessible'
      };
    } else {
      return {
        available: false,
        message: `❌ Qdrant responded with error: ${response.status}`,
        suggestions: [
          'Check if Qdrant container is running',
          'Verify port 6333 is accessible'
        ]
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('ECONNREFUSED')) {
      return {
        available: false,
        message: '❌ Qdrant is not running',
        suggestions: [
          'Start Qdrant: docker run -d --name crypto-qdrant -p 6333:6333 qdrant/qdrant',
          'Or run: powershell .\\setup-qdrant-simple.ps1',
          'Check Docker Desktop is running'
        ]
      };
    }

    return {
      available: false,
      message: `❌ Failed to connect to Qdrant: ${errorMessage}`,
      suggestions: [
        'Check if Docker is running',
        'Verify Qdrant container status: docker ps | findstr qdrant',
        'Check logs: docker logs crypto-qdrant'
      ]
    };
  }
}

export function printQdrantStatus(health: Awaited<ReturnType<typeof checkQdrantHealth>>) {
  console.log(health.message);
  
  if (!health.available && health.suggestions) {
    console.log('\n🔧 Suggestions:');
    health.suggestions.forEach(suggestion => {
      console.log(`  • ${suggestion}`);
    });
  }
}
