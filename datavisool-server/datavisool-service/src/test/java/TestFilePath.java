/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import java.nio.file.Path;
import java.nio.file.Paths;

public class TestFilePath {
    public static void main(String[] args) {
        String path = "D:\\path\\to\\datavisool-server\\static//images/test.png";
        Path path1 = Paths.get(path);
        System.out.println(path1.getFileName());
    }
}


