const si = require('systeminformation');

async function getSystemInfo() {
    try {
        const cpu = await si.cpu();
        const mem = await si.mem();
        const fsSize = await si.fsSize();
        const networkStats = await si.networkStats();

        // CPU 负载计算
        const cpuLoad = await si.currentLoad();

        // 内存使用率
        const memUsage = {
            total: mem.total,
            used: mem.used,
            free: mem.free,
            usage: (mem.used / mem.total) * 100
        };

        // 磁盘使用率
        const diskUsage = fsSize.map(fs => ({
            filesystem: fs.fs,
            size: fs.size,
            used: fs.used,
            available: fs.size - fs.used,
            usage: fs.use
        }));

        // 网络吞吐量 (取第一个非回环接口)
        const primaryInterface = networkStats.find(iface => iface.iface !== 'lo' && iface.iface !== 'Loopback Pseudo-Interface 1');
        const networkThroughput = primaryInterface ? {
            iface: primaryInterface.iface,
            rx_sec: primaryInterface.rx_sec,
            tx_sec: primaryInterface.tx_sec
        } : {
            iface: 'N/A',
            rx_sec: 0,
            tx_sec: 0
        };

        return {
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: cpu.brand,
                speed: cpu.speed,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
                load: cpuLoad.currentLoad
            },
            memory: memUsage,
            disk: diskUsage,
            network: networkThroughput
        };
    } catch (error) {
        console.error('Error fetching system info:', error);
        throw error;
    }
}

module.exports = { getSystemInfo };