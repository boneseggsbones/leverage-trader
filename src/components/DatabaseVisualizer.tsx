import React, { useEffect, useState } from 'react';

interface TableRow {
  [key: string]: string | number | boolean | null;
}

interface DatabaseData {
  [tableName: string]: TableRow[];
}

const DatabaseVisualizer = () => {
  const [data, setData] = useState<DatabaseData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:4000/api/db-data')
      .then(res => res.json())
      .then((data: DatabaseData) => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!data) {
    return <div>No data found.</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Database Visualizer</h1>
      {
        Object.entries(data).map(([tableName, tableData]) => (
          <div key={tableName} className="mb-8">
            <h2 className="text-xl font-semibold mb-2">{tableName}</h2>
            {tableData.length > 0 ? (
              <table className="table-auto w-full">
                <thead>
                  <tr>
                    {Object.keys(tableData[0]).map(key => (
                      <th key={key} className="px-4 py-2">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, i) => (
                        <td key={i} className="border px-4 py-2">{String(value ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No data in this table.</p>
            )}
          </div>
        ))
      }
    </div>
  );
};

export default DatabaseVisualizer;
