/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import org.junit.Test;
import oshi.SystemInfo;
import oshi.hardware.HardwareAbstractionLayer;

public class TestOShi {

    @Test
    public void getOsSystemInfo() {
        SystemInfo systemInfo = new SystemInfo();
        HardwareAbstractionLayer hardware = systemInfo.getHardware();
        System.out.println(hardware.getComputerSystem().getHardwareUUID());
        System.out.println(hardware.getComputerSystem().getBaseboard());
        System.out.println(hardware.getComputerSystem().getFirmware());
        System.out.println(hardware.getComputerSystem().getManufacturer());
    }
}


